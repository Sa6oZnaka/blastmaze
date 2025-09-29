import MenuScene from './MenuScene.js';
import GameScene from './GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a1a',
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  plugins: {
    scene: [
      {
        key: 'raycasterPlugin',
        plugin: PhaserRaycaster,
        mapping: 'raycasterPlugin'
      }
    ]
  },
  scene: [MenuScene, GameScene]
};

const game = new Phaser.Game(config);
