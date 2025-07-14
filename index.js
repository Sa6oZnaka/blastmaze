const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

function generateRandomMap(rows = 81, cols = 50) {
  const grid = [];

  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      if ((y === 0 && x === 0) || (y === 0 && x === 1) || (y === 1 && x === 0)) {
        row.push(0);
      } else {
        row.push(Math.random() < 0.8 ? 0 : 1);
      }
    }
    grid.push(row);
  }

  return grid;
}


app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  const grid = generateRandomMap(65, 90); // rows, cols
  const mapData = {
    grid,
    width: grid[0].length,
    height: grid.length,
  };

  socket.emit('mapData', mapData);

  socket.on('disconnect', () => {
    console.log(`Disconnected  : ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is working http://localhost:${PORT}`);
});
