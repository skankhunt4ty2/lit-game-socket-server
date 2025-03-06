# LIT Game Socket Server

This is the Socket.IO server for the LIT Card Game, handling real-time game state management and player interactions.

## Environment Variables

- NODE_ENV: Environment (development/production)
- PORT: Server port (default: 10000)
- CORS_ORIGIN: Allowed origin for CORS (default: https://lit-card-game.vercel.app)

## Development

\\\ash
# Install dependencies
npm install

# Start development server
npm run dev
\\\`n
## Production

\\\ash
# Install dependencies
npm install

# Start production server
npm start
\\\`n
## API Endpoints

- GET /health: Health check endpoint
- GET /socket.io: Socket.IO endpoint

## Socket Events

### Client to Server
- joinRoom: Join a game room
- leaveRoom: Leave a game room
- startGame: Start a game
- playCard: Play a card
- endTurn: End player's turn

### Server to Client
- oomJoined: Confirmation of room join
- oomLeft: Confirmation of room leave
- gameStarted: Game start notification
- gameState: Updated game state
- playerTurn: Current player's turn notification
- gameEnded: Game end notification
