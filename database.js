const { MongoClient, ObjectId  } = require('mongodb')


const url = "mongodb+srv://sunj0321:lbvWOMJK9q3hOJAh@cluster0.g3d1w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
let connectDB = new MongoClient(url).connect()

module.exports = connectDB 