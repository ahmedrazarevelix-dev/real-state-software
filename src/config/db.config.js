const prisma = require("./prisma.client.js");


const connectDB = async() => {
    try {
        await prisma.$connect();
        console.log("postgresql connection via prisma");
    }
    catch(error){
        console.log("Database connect Failed:", error.message);
        process.exit(1);
    }
};

module.exports = connectDB;

