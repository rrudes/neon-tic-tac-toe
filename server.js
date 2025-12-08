const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

app.use(express.static("public"));

const rooms = {}; 

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 mins
const roomTimers = {};

function createEmptyBoard() {
  return Array(9).fill(null);
}

// UPDATED: Now returns { symbol, line } instead of just symbol
function checkWinner(b) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b1, c] of lines) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) {
      return { symbol: b[a], line: [a, b1, c] };
    }
  }
  return null;
}

function getActivePlayersCount(room) {
    return (room.players.X ? 1 : 0) + (room.players.O ? 1 : 0);
}

function cleanupRoom(roomId) {
  if (roomTimers[roomId]) {
    clearTimeout(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
  delete rooms[roomId];
  console.log(`Room ${roomId} cleaned up`);
}

function scheduleRoomCleanup(roomId) {
  if (roomTimers[roomId]) clearTimeout(roomTimers[roomId]);
  roomTimers[roomId] = setTimeout(() => {
    cleanupRoom(roomId);
  }, INACTIVITY_TIMEOUT);
}

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ roomId, password }) => {
    // defensive: ensure roomId is a string before trimming
    roomId = String(roomId || "").trim().toLowerCase();
    
    // simple validation
    if (!roomId || roomId.length < 3) {
      socket.emit("roomError", "Room code must be at least 3 characters.");
      return;
    }

    if (!rooms[roomId]) {
      rooms[roomId] = {
        password: password || "",
        board: createEmptyBoard(),
        players: { X: null, O: null }, 
        turn: "X",
        moves: 0
      };
      console.log(`Room ${roomId} created`);
    }

    const room = rooms[roomId];

    if (room.password && room.password !== password) {
      socket.emit("roomError", "Incorrect password.");
      return;
    }

    let symbol = null;
    if (room.players.X === socket.id) symbol = "X";
    else if (room.players.O === socket.id) symbol = "O";
    else {
        if (room.players.X === null) { room.players.X = socket.id; symbol = "X"; }
        else if (room.players.O === null) { room.players.O = socket.id; symbol = "O"; }
    }
    
    socket.join(roomId);

    const activePlayers = getActivePlayersCount(room);

    socket.emit("init", {
      symbol,
      board: room.board,
      turn: room.turn,
      playersCount: activePlayers
    });

    socket.emit("roomJoined", roomId); // Send roomId back for confirmation
    io.to(roomId).emit("playersCount", activePlayers);

    scheduleRoomCleanup(roomId);
  });

  socket.on("makeMove", ({ roomId, index, symbol }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomError", "Room not found. Please rejoin."); 
      return;
    }
    
    if (room.players[symbol] !== socket.id) {
        socket.emit("roomError", `You are not player ${symbol}. Access denied.`);
        return;
    }

    if (room.turn !== symbol) {
      socket.emit("roomError", "Not your turn.");
      return;
    }

    if (room.board[index]) {
      socket.emit("roomError", "Cell taken.");
      return;
    }

    room.board[index] = symbol;
    room.moves++;
    room.turn = symbol === "X" ? "O" : "X";

    const winData = checkWinner(room.board);
    const winner = winData ? winData.symbol : null;
    const winningLine = winData ? winData.line : null;
    const isDraw = !winner && room.moves === 9;

    // Broadcast move AND winning line info
    io.to(roomId).emit("moveMade", {
      index,
      symbol,
      turn: room.turn,
      winner,
      winningLine, 
      isDraw
    });

    if (winner || isDraw) {
      setTimeout(() => {
        room.board = createEmptyBoard();
        room.turn = "X";
        room.moves = 0;
        io.to(roomId).emit("resetBoard");
      }, 3000); // Increased to 3s to let the confetti settle
    }

    scheduleRoomCleanup(roomId);
  });

  socket.on("disconnecting", () => {
    for (const rid of socket.rooms) {
      // skip the socket's own room id
      if (rid === socket.id) continue;
      if (!rooms[rid]) continue;
      const room = rooms[rid];
      let wasPlayer = false;
      if (room.players.X === socket.id) { room.players.X = null; wasPlayer = true; }
      if (room.players.O === socket.id) { room.players.O = null; wasPlayer = true; }

      const activePlayers = getActivePlayersCount(room);
      // always emit updated count to room (spectators + players)
      io.to(rid).emit("playersCount", activePlayers);

      if (activePlayers === 0) cleanupRoom(rid);
      else scheduleRoomCleanup(rid);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Server running on http://localhost:${PORT}`);
});