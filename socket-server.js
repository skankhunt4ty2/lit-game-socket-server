require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Add detailed logging
console.log('Starting server initialization...');
console.log('Environment variables:', {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_VERSION: process.version
});

const app = express();

// Trust proxy for proper protocol handling
app.set('trust proxy', true);

// Configure CORS properly
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'https://lit-card-game.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Handle CORS preflight requests first, before any other middleware
app.options('*', cors(corsOptions));

// Apply CORS middleware
app.use(cors(corsOptions));

// Add specific handler for Socket.IO preflight requests
app.options('/socket.io/*', (req, res) => {
  console.log('Socket.IO preflight request received');
  console.log('Headers:', req.headers);
  console.log('Origin:', req.headers.origin);
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://lit-card-game.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  
  // Send 204 No Content for preflight
  res.status(204).end();
});

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Origin:', req.headers.origin);
  console.log('Protocol:', req.protocol);
  console.log('Host:', req.hostname);
  console.log('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
  console.log('X-Forwarded-Host:', req.headers['x-forwarded-host']);
  next();
});

const server = http.createServer(app);

try {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'https://lit-card-game.vercel.app',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    allowEIO3: true,
    allowUpgrades: true,
    path: '/socket.io',
    cookie: false,
    maxHttpBufferSize: 1e8,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    cors: {
      origin: process.env.CORS_ORIGIN || 'https://lit-card-game.vercel.app',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
      credentials: true
    }
  });

  // Add connection logging
  io.engine.on('connection', (socket) => {
    console.log('New connection attempt:', socket.id);
    console.log('Transport:', socket.conn.transport.name);
    console.log('Protocol:', socket.conn.protocol);
    console.log('Headers:', socket.handshake.headers);
  });

  io.engine.on('upgrade', (req, socket, head) => {
    console.log('Upgrading connection to WebSocket');
    console.log('Request headers:', req.headers);
    console.log('Protocol:', req.protocol);
    console.log('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
  });

  io.engine.on('upgradeError', (err, req, socket) => {
    console.error('Upgrade error:', err);
    console.error('Request headers:', req.headers);
    console.error('Protocol:', req.protocol);
    console.error('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
  });

  // Add error handling for the server
  server.on('error', (error) => {
    console.error('Server error:', error);
  });

  // Add detailed logging for CORS origin
  console.log('Socket.IO server initialized successfully');
  console.log('CORS origin:', process.env.CORS_ORIGIN || "https://lit-card-game.vercel.app");
  console.log('Server port:', process.env.PORT || 3002);
  console.log('Socket.IO path:', '/socket.io');
  console.log('Available transports:', io.engine.transports);
  console.log('Node version:', process.version);
  console.log('Environment:', process.env.NODE_ENV);

  // Store active game rooms
  const gameRooms = new Map();

  // Helper function to create and shuffle deck
  function createAndShuffleDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const lowerRanks = ['ace', '2', '3', '4', '5', '6'];
    const upperRanks = ['8', '9', '10', 'jack', 'queen', 'king'];
    const deck = [];

    // Create lower set cards
    suits.forEach(suit => {
      lowerRanks.forEach(rank => {
        deck.push({ suit, rank, setType: 'lower' });
      });
    });

    // Create upper set cards
    suits.forEach(suit => {
      upperRanks.forEach(rank => {
        deck.push({ suit, rank, setType: 'upper' });
      });
    });

    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  // Helper function to check if a card request is valid
  function isValidRequest(requestingPlayer, targetPlayer, requestedCard) {
    // Can't request from yourself
    if (requestingPlayer.id === targetPlayer.id) return false;

    // Can't request from a teammate
    if (requestingPlayer.team === targetPlayer.team) return false;

    // Can't request if you don't have any cards
    if (requestingPlayer.hand.length === 0) return false;

    // Can't request if target doesn't have any cards
    if (targetPlayer.hand.length === 0) return false;

    // Can't request if you don't have any cards from the same set
    const hasCardFromSet = requestingPlayer.hand.some(card => 
      card.suit === requestedCard.suit && card.setType === requestedCard.setType
    );
    if (!hasCardFromSet) return false;

    // Can't request if you already have the card
    const hasRequestedCard = requestingPlayer.hand.some(card =>
      card.suit === requestedCard.suit &&
      card.rank === requestedCard.rank &&
      card.setType === requestedCard.setType
    );
    if (hasRequestedCard) return false;

    return true;
  }

  // Helper function to transfer a card between players
  function transferCard(fromPlayer, toPlayer, suit, rank, setType) {
    const cardIndex = fromPlayer.hand.findIndex(card =>
      card.suit === suit &&
      card.rank === rank &&
      card.setType === setType
    );

    if (cardIndex === -1) return false;

    const card = fromPlayer.hand.splice(cardIndex, 1)[0];
    toPlayer.hand.push(card);
    return true;
  }

  // Helper function to check if a team has a complete set
  function teamHasCompleteSet(players, team, suit, setType) {
    const teamPlayers = players.filter(p => p.team === team);
    const teamCards = teamPlayers.flatMap(p => p.hand);
    
    const ranks = setType === 'lower' 
      ? ['ace', '2', '3', '4', '5', '6']
      : ['8', '9', '10', 'jack', 'queen', 'king'];

    return ranks.every(rank =>
      teamCards.some(card =>
        card.suit === suit &&
        card.rank === rank &&
        card.setType === setType
      )
    );
  }

  // Helper function to check win condition
  function checkWinCondition(capturedSets) {
    const redSets = capturedSets.filter(set => set.team === 'red').length;
    const blueSets = capturedSets.filter(set => set.team === 'blue').length;

    if (redSets >= 3 && redSets > blueSets) return 'red';
    if (blueSets >= 3 && blueSets > redSets) return 'blue';
    if (redSets >= 3 && blueSets >= 3 && redSets === blueSets) return 'draw';
    return null;
  }

  // Helper function to get next player
  function getNextPlayer(currentPlayerId, players) {
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex];
  }

  // Socket.IO event handlers
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      // Find and remove player from any room
      for (const [roomName, room] of gameRooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          console.log(`Removing player from room ${roomName}`);
          // Implement player removal logic
        }
      }
    });

    // Handle create room request
    socket.on('createRoom', (data) => {
      try {
        console.log(`Create room request: ${JSON.stringify(data)}`);
        const { playerName, roomName, playerCount } = data;
        
        if (!playerName || !roomName) {
          console.error('Invalid createRoom data: missing playerName or roomName');
          socket.emit('error:createRoom', { message: 'Player name and room name are required' });
          return;
        }
        
        if (gameRooms.has(roomName)) {
          console.log(`Room ${roomName} already exists`);
          socket.emit('error:createRoom', { message: 'Room already exists' });
          return;
        }
        
        // Create player ID
        const playerId = `${socket.id}`;
        
        // Create room
        const room = {
          name: roomName,
          players: [{ 
            id: playerId, 
            name: playerName, 
            socketId: socket.id,
            team: null,
            hand: [],
            isHost: true
          }],
          maxPlayers: playerCount,
          status: 'waiting',
          teams: {
            A: [],
            B: []
          },
          currentTurn: null,
          deck: [],
          capturedSets: {
            A: [],
            B: []
          },
          lastAction: null
        };
        
        // Add room to game rooms
        gameRooms.set(roomName, room);
        
        // Add socket to room
        socket.join(roomName);
        
        console.log(`Room ${roomName} created by ${playerName}`);
        
        // Send success response
        socket.emit('roomCreated', { roomName, playerId });
        
      } catch (error) {
        console.error('Error creating room:', error);
        socket.emit('error:createRoom', { message: 'Server error creating room' });
      }
    });

    // Join an existing room
    socket.on('joinRoom', ({ playerName, roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (room.players.length >= room.playerCount) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      const playerId = socket.id;
      const player = {
        id: playerId,
        name: playerName,
        hand: [],
        team: 'unassigned',
        connected: true,
        canClaimTurn: false
      };

      room.players.push(player);
      socket.join(roomName);
      socket.emit('joinedRoom', { roomName, playerId });
    });

    // Join a team
    socket.on('joinTeam', ({ roomName, team }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      player.team = team;
      io.to(roomName).emit('roomUpdate', room);
    });

    // Start the game
    socket.on('startGame', ({ roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (socket.id !== room.adminId) {
        socket.emit('error', { message: 'Only the admin can start the game' });
        return;
      }

      if (room.players.length !== room.playerCount) {
        socket.emit('error', { message: 'Room is not full' });
        return;
      }

      const redTeam = room.players.filter(p => p.team === 'red');
      const blueTeam = room.players.filter(p => p.team === 'blue');

      if (redTeam.length !== blueTeam.length) {
        socket.emit('error', { message: 'Teams must be balanced' });
        return;
      }

      // Deal cards
      const deck = createAndShuffleDeck();
      room.players.forEach(player => {
        player.hand = deck.splice(0, 6);
      });

      // Set initial turn
      room.currentTurnPlayerId = room.players[0].id;
      room.gameStatus = 'playing';

      io.to(roomName).emit('gameStarted', room);
    });

    // Request a card
    socket.on('requestCard', ({ roomName, targetPlayerId, suit, rank, setType }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const requestingPlayer = room.players.find(p => p.id === socket.id);
      const targetPlayer = room.players.find(p => p.id === targetPlayerId);

      if (!requestingPlayer || !targetPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      if (requestingPlayer.id !== room.currentTurnPlayerId) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      const requestedCard = { suit, rank, setType };

      if (!isValidRequest(requestingPlayer, targetPlayer, requestedCard)) {
        socket.emit('error', { message: 'Invalid card request' });
        return;
      }

      const hasCard = targetPlayer.hand.some(card =>
        card.suit === suit &&
        card.rank === rank &&
        card.setType === setType
      );

      if (hasCard) {
        transferCard(targetPlayer, requestingPlayer, suit, rank, setType);
        room.lastAction = `${requestingPlayer.name} got the ${rank} of ${suit} from ${targetPlayer.name}`;
      } else {
        room.lastAction = `${requestingPlayer.name} asked ${targetPlayer.name} for the ${rank} of ${suit} but they didn't have it`;
      }

      room.currentTurnPlayerId = targetPlayer.id;
      io.to(roomName).emit('gameUpdate', room);
    });

    // Declare a set
    socket.on('declareSet', ({ roomName, suit, setType }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const declaringPlayer = room.players.find(p => p.id === socket.id);
      if (!declaringPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      if (declaringPlayer.id !== room.currentTurnPlayerId) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      const isCorrect = teamHasCompleteSet(room.players, declaringPlayer.team, suit, setType);

      if (isCorrect) {
        room.capturedSets.push({
          team: declaringPlayer.team,
          suit,
          setType
        });

        room.lastAction = `${declaringPlayer.name} correctly declared the ${setType} ${suit} set for the ${declaringPlayer.team} team`;
      } else {
        const opposingTeam = declaringPlayer.team === 'red' ? 'blue' : 'red';
        room.capturedSets.push({
          team: opposingTeam,
          suit,
          setType
        });

        room.lastAction = `${declaringPlayer.name} incorrectly declared the ${setType} ${suit} set, giving it to the ${opposingTeam} team`;
      }

      const winner = checkWinCondition(room.capturedSets);
      if (winner) {
        room.gameStatus = 'finished';
        room.winner = winner;
        io.to(roomName).emit('gameUpdate', room);
        return;
      }

      // Set next turn
      room.currentTurnPlayerId = getNextPlayer(declaringPlayer.id, room.players).id;
      io.to(roomName).emit('gameUpdate', room);
    });

    // Claim turn
    socket.on('claimTurn', ({ roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      if (!player.canClaimTurn) {
        socket.emit('error', { message: 'You cannot claim the turn' });
        return;
      }

      player.canClaimTurn = false;
      room.currentTurnPlayerId = player.id;
      io.to(roomName).emit('gameUpdate', room);
    });
  });

  // Root route handler
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Socket.IO server is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      corsOrigin: process.env.CORS_ORIGIN
    });
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      port: process.env.PORT,
      corsOrigin: process.env.CORS_ORIGIN,
      headers: req.headers,
      protocol: req.protocol,
      host: req.hostname,
      forwardedProto: req.headers['x-forwarded-proto'],
      forwardedHost: req.headers['x-forwarded-host']
    });
  });

  // Get port from environment variable or use default
  const PORT = process.env.PORT || 3002;

  console.log(`Attempting to start server on port ${PORT}...`);

  server.listen(PORT, () => {
    console.log(`Socket.IO server running on port ${PORT}`);
    console.log(`##################################`);
    console.log(`# Socket.io server active on port ${PORT} #`);
    console.log(`# Connect your client to this port #`);
    console.log(`##################################`);
  });
} catch (error) {
  console.error('Error during server initialization:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

// Add uncaught exception handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 