function generateRandomMap(rows = 81, cols = 50) {
        const grid = [];
        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                if ((y === 0 && x === 0) || (y === 0 && x === 1) || (y === 1 && x === 0)) {
                    row.push(0);
                } else {
                    const r = Math.random();
                    if (r < 0.05) row.push(2); // indestructible
                    else if (r < 0.2) row.push(1); // destructible
                    else row.push(0); // empty
                }
            }
            grid.push(row);
        }
        return grid;
    }

function generateBombermanMap(width, height) {
    const grid = [];

    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            if (x % 2 === 1 && y % 2 === 1) {
                row.push(2);
            } else if (Math.random() < 0.3) {
                row.push(1);
            } else {
                row.push(0);
            }
        }
        grid.push(row);
    }

    return grid;
}



module.exports = {
    generateRandomMap, generateBombermanMap
};
