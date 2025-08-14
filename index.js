const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const grid = generateRandomMap(81, 50);
const players = {};
const bombs = [];

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

    const mapData = {
        grid,
        width: grid[0].length,
        height: grid.length,
    };

    players[socket.id] = {
        id: socket.id,
        x: 0,
        y: 0
    };

    socket.emit('mapData', mapData);
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('playerJoined', players[socket.id]);
  
    socket.on('move', ({ dx, dy }) => {
    const player = players[socket.id];
        if (!player) return;

        player.x += dx;
        player.y += dy;

        io.emit('playerMoved', {
            id: socket.id,
            x: player.x,
            y: player.y
        });
    });

    socket.on('placeBomb', () => {
        const player = players[socket.id];
        if (!player) return;

        const bombX = player.x;
        const bombY = player.y;

        bombs.push({
            bombX,
            bombY,
            timer: setTimeout(() => explodeBomb(bombX, bombY), 3000)
        });

        io.emit('bombPlaced', {
            id: socket.id,
            x: bombX,
            y: bombY
        });

        /*setTimeout(() => {
            io.emit('bombExploded', { x: bombX, y: bombY });
        }, 3000);*/
    });

    socket.on('disconnect', () => {
        console.log(`Disconnected  : ${socket.id}`);
        delete players[socket.id];
        io.emit('playerLeft', { id: socket.id });
    });
});

function explodeBomb(bombX, bombY) {
    // remove bomb
    const index = bombs.findIndex(b => b.bombX === bombX && b.bombY === bombY);
    if (index !== -1) bombs.splice(index, 1);

    // radius 1
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = bombX + dx;
            const ny = bombY + dy;
            if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length) {
                grid[ny][nx] = 0;
            }
        }
    }

    io.emit('bombExploded', { x: bombX, y: bombY, grid });

    // exploade near bombs
    bombs.forEach(bomb => {
        if (Math.abs(bomb.bombX - bombX) <= 1 && Math.abs(bomb.bombY - bombY) <= 1) {
            clearTimeout(bomb.timer);
            explodeBomb(bomb.bombX, bomb.bombY);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is working http://localhost:${PORT}`);
});
