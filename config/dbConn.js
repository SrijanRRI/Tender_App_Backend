import mongoose from 'mongoose';
const MONGODB_URL = process.env.MONGO_URI;
console.log(MONGODB_URL);

const connectToDb = ()=>{
     mongoose.connect(MONGODB_URL)
     .then((conn)=>(console.log(`Connect to db ${conn.connection.host}`)))
     .catch((err)=>(console.log(err.message)))
}

export default connectToDb;