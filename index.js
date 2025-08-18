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

        // check if there is bomb
        const bombExists = bombs.some(b => b.bombX === bombX && b.bombY === bombY);
        if (bombExists) return; 

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
    });

    socket.on('disconnect', () => {
        console.log(`Disconnected  : ${socket.id}`);
        delete players[socket.id];
        io.emit('playerLeft', { id: socket.id });
    });
});

function explodeBomb(bombX, bombY) {
    const affected = collectExplosion(bombX, bombY);

    const affectedArr = Array.from(affected).map(str => {
        const [x, y] = str.split(',').map(Number);
        return { x, y };
    });

    io.emit('bombExploded', { x: bombX, y: bombY, affected: affectedArr });
}

function collectExplosion(bombX, bombY, affected = new Set()) {
    const index = bombs.findIndex(b => b.bombX === bombX && b.bombY === bombY);
    if (index !== -1) bombs.splice(index, 1);

    // center
    affected.add(`${bombX},${bombY}`);
    grid[bombY][bombX] = 0;

    const directions = [
        { dx: 1, dy: 0 },   // right
        { dx: -1, dy: 0 },  // left
        { dx: 0, dy: 1 },   // down
        { dx: 0, dy: -1 }   // up
    ];

    const radius = 3;

    for (const { dx, dy } of directions) {
        for (let step = 1; step <= radius; step++) {
            const nx = bombX + dx * step;
            const ny = bombY + dy * step;

            if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) break;

            if (grid[ny][nx] === 1) { 
                grid[ny][nx] = 0;
                affected.add(`${nx},${ny}`);
                break;
            } else {
                affected.add(`${nx},${ny}`);
            }
        }
    }

    const neighbors = bombs.filter(bomb => affected.has(`${bomb.bombX},${bomb.bombY}`));
    neighbors.forEach(bomb => {
        clearTimeout(bomb.timer);
        collectExplosion(bomb.bombX, bomb.bombY, affected);
    });

    return affected;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is working http://localhost:${PORT}`);
});
