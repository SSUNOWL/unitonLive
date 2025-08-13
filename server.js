// 1. Express 모듈을 불러옵니다.
const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb')
require('dotenv').config()
const cors = require('cors'); // 1. cors 패키지를 불러옵니다.


// 1. 필요한 모듈 불러오기
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --- 설정값 ---
const apiHost = 'https://api.tilko.net';
const apiKey = process.env.emdrl_api;
// --- 설정값 끝 ---


function aesEncrypt(key, iv, plainText) {
    // createCipheriv는 PKCS7 패딩을 자동으로 처리합니다.
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

/**
 * RSA 공개키로 데이터 암호화 함수 (PKCS1_v1_5 Padding)
 * @param {string} rsaPublicKey - Base64 인코딩된 RSA 공개키
 * @param {Buffer} dataToEncrypt - 암호화할 데이터 (AES 키)
 * @returns {Buffer} - 암호화된 데이터 버퍼
 */
function rsaEncrypt(rsaPublicKey, dataToEncrypt) {
    // Node.js crypto 모듈이 인식할 수 있는 PEM 형식으로 키를 변환합니다.
    const pemKey = `-----BEGIN PUBLIC KEY-----\n${rsaPublicKey}\n-----END PUBLIC KEY-----`;
    
    const encryptedBuffer = crypto.publicEncrypt(
        {
            key: pemKey,
            padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        dataToEncrypt
    );
    return encryptedBuffer;
}

/**
 * API 서버로부터 RSA 공개키를 조회하는 함수
 * @returns {Promise<string>} - Base64 인코딩된 RSA 공개키
 */
async function getPublicKey() {
    try {
        const response = await axios.get(`${apiHost}/api/Auth/GetPublicKey`, {
            params: { APIkey: apiKey },
            headers: { 'Content-Type': 'application/json' },
        });
        return response.data.PublicKey;
    } catch (error) {
        console.error('RSA 공개키를 가져오는 데 실패했습니다:', error.response?.data || error.message);
        throw error;
    }
}



// 2. Express 앱을 생성합니다.
const app = express();
app.use(cors());

app.use(express.json());
// 3. 포트 번호를 설정합니다.
const port = 8081;

// 4. GET 요청에 대한 라우터 설정
//    '/' 경로로 GET 요청이 오면 'Hello World!'를 응답합니다.
async function fetchAndProcessData(email, uniqueNo, name) {

     try {
        // 1. RSA 공개키 조회
        // console.log('RSA 공개키를 조회합니다...');
        const rsaPublicKey = await getPublicKey();
        // console.log(`- RSA Public Key 수신 완료.`);

        // 2. AES 대칭키 및 IV 생성
        const aesKey = crypto.randomBytes(16); // 128비트 (16바이트) 키
        const aesIv = Buffer.alloc(16, 0); // 16바이트 0으로 채워진 IV

        // 3. AES 키를 RSA 공개키로 암호화 (ENC-KEY 헤더값)
        const aesCipherKeyBuffer = rsaEncrypt(rsaPublicKey, aesKey);
        const aesCipherKey = aesCipherKeyBuffer.toString('base64');
        // console.log(`- ENC-KEY 생성 완료: ${aesCipherKey.substring(0, 30)}...`);

        // 4. API 요청 파라미터 설정
        const url = `${apiHost}/api/v2.0/Iros2IdLogin/RetrieveApplCsprCsList`;
        const requestData = {
            Auth: {
                UserId: aesEncrypt(aesKey, aesIv, process.env.emdrl_ID),
                UserPassword: aesEncrypt(aesKey, aesIv, process.env.emdrl_PW)
            },
            Pin: uniqueNo,
            A103Name: name,
            RealClsCd: "3",
            NameType: "1"
        };
        
        const requestHeaders = {
            'Content-Type': 'application/json',
            'API-KEY': apiKey,
            'ENC-KEY': aesCipherKey
        };

        // 5. API 호출
        // console.log(`\nAPI를 호출합니다: ${url}`);
        const response = await axios.post(url, requestData, { headers: requestHeaders });
        // console.log('- API 응답 수신 완료.');
        console.log('Response:', JSON.stringify(response.data, null, 2));

        // 6. 결과 파일로 저장
        const date = new Date
        const time = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',  // ✅ KST 적용
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false, // ✅ 24시간제 사용
        }).format(date);
        
        console.log(response.data)
        if ( response.data.Result == null){
            let insertLog = await db.collection('log').insertOne({
                email : email, 
                uniqueNo : uniqueNo,
                name : name,     
                time : time,
                submit : false
            })
            return false
        } else {
            var ResultList = response.data.Result
            var Case = ResultList[ResultList.length - 1]
            if (Case.CheoliSangtae == '각하' || Case.CheoliSangtae == '취하') {
                    let insertLog = await db.collection('log').insertOne({
                    email : email,
                    uniqueNo : uniqueNo,
                    name : name,     
                    time : time,
                    submit : false,
                    purpose : Case.DeunggiMogjeog.replace(/ /g,""),
                    status : Case.CheoliSangtae.replace(/ /g,"")
                })
                return false
            } else {
                let insertLog = await db.collection('log').insertOne({
                    email : email,
                    uniqueNo : uniqueNo,
                    name : name,     
                    time : time,
                    submit : true,
                    purpose : Case.DeunggiMogjeog.replace(/ /g,""),
                    status : Case.CheoliSangtae.replace(/ /g,"")
                })
                await sendEmail(email, purpose, status)

            }
            return true
        }  
    } catch (error) {
        console.error('\n오류가 발생했습니다:', error.response?.data || error.message);
        return false
    }
    
};

async function sendEmail(email, purpose, status) {
    url = 'http://3.39.231.53:8080/api/emails/notice'
    redirectURL = `http://localhost:3000/Solution?purpose=${purpose}&status=${status}`
    requestData = {
        email : email,
        redirectUrl : redirectURL
    }
    requestHeaders = {
        "accept": "*/*",
        "Content-Type": "application/json"
    }
    const response = await axios.post(url, requestData, { headers: requestHeaders });
    return response

}

app.get('/send/:email/:name/:uniqueNo/:purpose/:status', async(req, res) => {
    const date = new Date
        const time = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',  // ✅ KST 적용
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false, // ✅ 24시간제 사용
        }).format(date);
    let insertLog = await db.collection('log').insertOne({
        email : req.params.email,
        uniqueNo : req.params.uniqueNo,
        name : req.params.name,     
        time : time,
        submit : true,
        purpose : req.params.purpose,
        status : req.params.status
    })
    await sendEmail(req.params.email, req.params.purpose, req.params.status)

})



async function emailList() {
    try{
        var result = await db.collection('user').find().toArray()
        // console.log(result)
        sum = 0
        for ( i = 0 ; i < result.length ; i++ ) {
            console.log(result[i].name)
            if(await fetchAndProcessData(result[i].email, result[i].uniqueNo, result[i].name)) {
                console.log(result[i].email + "문제 발생 이메일 보냄")
                //백한테 email정보랑, 링크주소 (localhost:3000/Live/email 이렇게? 생각함)
                sum = sum +1
            } else{
                console.log('문제없음')
            }
        }

        return sum
    }
    catch (e){
        console.log(e)
        console.log('emailList 에러')
    }
}

app.get('/list', async(req, res) => {
    sum = await emailList();
    res.send(sum)
})

let pollingInterval; // setInterval의 ID를 저장할 변수

// 주기적 조회를 시작하는 라우트
app.get('/start/:time', (req, res) => {
    if (pollingInterval) {  
        return res.send('이미 주기적 조회가 실행 중입니다.');
    }
    var intervalSeconds
    // 1초 간격으로 설정 (1 * 1000 ms)
    if (req.params.time) {intervalSeconds = req.params.time; }
    else intervalSeconds = 120;
    console.log(`${intervalSeconds}분 간격으로 API 조회를 시작합니다.`);
    
    // 서버 시작 시 즉시 1회 실행
    emailList(); 
    
    // 이후 설정된 간격으로 주기적 실행
    pollingInterval = setInterval(emailList, intervalSeconds  * 1000);
    
    res.send(`${intervalSeconds}분 간격으로 API 조회를 시작했습니다. 중지하려면 /stop을 호출하세요.`);
});

// 주기적 조회를 중지하는 라우트
app.get('/stop', (req, res) => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null; // ID 변수 초기화
        console.log('주기적 조회를 중지했습니다.');
        res.send('주기적 조회를 중지했습니다.');
    } else {
        res.send('실행 중인 주기적 조회가 없습니다.');
    }
});

// 서버 기본 라우트
app.get('/', (req, res) => {
    const status = pollingInterval ? '실행 중' : '중지됨';
    res.send(`API 조회 서버입니다. 현재 상태: ${status}. 조회를 시작하려면 /start를 호출하세요.`);
});


app.post('/user', async(req, res) => {
    try{
        // console.log(req.body)
        var findEmail = await db.collection('user').find({email : req.body.email}).toArray()
        for (i = 0 ; i < findEmail.length ; i++) {
            if(req.body.uniqueNo == findEmail[i].uniqueNo) {
                console.log('한 이메일에 같은 주소')
                throw '한 이메일에 같은 주소'
            }
        }

        let result = await db.collection('user').insertOne({
            email : req.body.email,
            uniqueNo : req.body.uniqueNo,
            name : req.body.name,
        })

        console.log(result)
        res.send('완료')

    } catch(e){
        console.log('error')
        res.status(400)
        res.send(e.message)
    }

})

app.post('/log', async(req, res) => {
    var userLog = await db.collection('log').find({email : req.body.email}).toArray()

    res.send(userLog)
})





let connectDB = require('./database.js');
const send = require('send');

let db

connectDB.then((client)=>{
  console.log('DB연결성공')
  db = client.db('uniton')  // database 이름

}).catch((err)=>{
  console.log(err)
})



// Render가 제공하는 PORT 환경 변수를 사용하고, 없다면 3000번 포트를 사용
const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log(`${PORT}번 포트에서 서버 실행 중...`);
});

