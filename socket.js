const socketIo = require('socket.io');

module.exports = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: "https://lit-card-game.vercel.app",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected');
    
    // ...existing code...

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
};
