// PreloadScene.js
export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload() {
        const { centerX, centerY, width, height } = this.cameras.main;

        // === BACKGROUND ===
        const bg = this.add.rectangle(centerX, centerY, width, height, 0x1a1a1a);

        // === Loading Text ===
        const loadingText = this.add.text(centerX, centerY, 'Loading...', {
            fontFamily: '"Roboto Condensed"',
            fontSize: '48px',
            color: '#ffbb55'
        }).setOrigin(0.5);

        // Add a simple loading bar
        const barWidth = 400, barHeight = 25;
        const barBg = this.add.rectangle(centerX, centerY + 60, barWidth, barHeight, 0x333333);
        const barFill = this.add.rectangle(centerX - barWidth / 2, centerY + 60, 0, barHeight, 0xc58b4e).setOrigin(0, 0.5);

        this.load.on('progress', (value) => {
            barFill.width = barWidth * value;
        });

        this.load.on('complete', () => {
            this.scene.start('MenuScene');
        });

        // === Assets for MenuScene ===
        this.load.image('bg', 'assets/block.png');

        // === Assets for Game
        this.load.image('block', './assets/block.png');
        this.load.image('block2', './assets/block2.png');
        this.load.spritesheet('bomb', 'assets/bomb.png', {
            frameWidth: 90, 
            frameHeight: 90
        });

        this.load.spritesheet('player', 'assets/marto.png', {
            frameWidth: 124,
            frameHeight: 124
        });
    }

    create() {

    }
}
