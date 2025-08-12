const { MongoClient, ObjectId  } = require('mongodb')


const url = process.env.MongoDBurl;
let connectDB = new MongoClient(url).connect()

module.exports = connectDB 