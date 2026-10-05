require("dotenv").config();

const http = require('http');
const connectDB = require("./config/db.config");
const app = require("./app");
const prisma = require("./config/prisma.client");
const socketConfig = require("./config/socket.config");

const PORT = process.env.PORT || 5000;
let server;
let io;

connectDB()
   .then(() => {
     // Create HTTP server
     server = http.createServer(app);
     
     // Initialize Socket.IO
     io = socketConfig.initialize(server);
     
     // Start server
     server.listen(PORT, () => {
        console.log(`✅ Real-estate API running on port ${PORT}`);
        console.log(`✅ WebSocket server ready on port ${PORT}`);
     });
   })
   .catch((error) => {
      console.log("Failed to connect to database:", error);
      process.exit(1);
   });

const shutdown = async () => {
    console.log("Shutting down gracefully...");
    
    // Close Socket.IO connections
    if (io) {
        console.log("Closing WebSocket connections...");
        io.close();
    }
    
    // Close HTTP server
    if (server) {
        console.log("Closing HTTP server...");
        server.close();
    }
    
    // Disconnect from database
    console.log("Disconnecting from database...");
    await prisma.$disconnect();
    
    console.log("✅ Shutdown complete");
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
