import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getFirestore, doc, arrayUnion, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const firebaseConfig = {
  
};

// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
// const db = getFirestore(app);

let gameScreen = document.getElementById('gameScreen');

const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');

const initialDpr = window.devicePixelRatio || 1;
let addDpr = 0;
let dpr;
let cores = navigator.hardwareConcurrency || 1;

function adjustDpr(addDpr) {
  if (cores <= 4) {
    dpr = initialDpr/2.55
  } else if (cores <= 8 ) {
    dpr = initialDpr/(2.1 + addDpr)
  } else {
    dpr = initialDpr 
  }
}

adjustDpr(addDpr);

canvas.width = gameScreen.clientWidth * (dpr);
canvas.height = gameScreen.clientHeight * (dpr) ;

canvas.style.width = gameScreen.clientWidth + 'px';
canvas.style.height =  gameScreen.clientHeight + 'px';

let shieldDown = new Audio('audio/shield_down.wav');
let death = new Audio('audio/player_death.wav');
let backgroundMusic = new Audio('audio/background_music.mp3');
backgroundMusic.loop = true; 
let gameStart = new Audio('audio/game_start.wav');
let dash = new Audio('audio/dash_sound.wav');
let victorySound = new Audio('audio/victory_sound.wav');
let gameOverAudio = new Audio('audio/game_over.wav');


gameStart.volume = 0.35;
death.volume = 0.5;
backgroundMusic.volume = 0;
dash.volume = 0.25;
victorySound.volume = 0.6;

const startButton = document.getElementById('start-button');
const modalEl = document.getElementById('modalEl');
const nicknameEl = document.getElementById('nicknameEl');
const fullScreenButton = document.getElementById('fullScreenButton');
const joyDiv = document.getElementById('joyDiv');
const victoryScreen = document.getElementById('victoryScreen');

class Border {
  constructor() { 
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.radius = canvas.height/2;
    this.initialRadius = this.radius;
  }
  resize(oldCanvasWidth, oldCanvasHeight) {
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    
    let oldInitialRadius = this.initialRadius;
    this.initialRadius = canvas.height / 2;
    this.radius = this.radius * this.initialRadius / oldInitialRadius;
  }
  draw() {
    c.strokeStyle = 'white';
    c.lineWidth = this.initialRadius/30;
    c.beginPath();
    c.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
    c.stroke();
  }
  update() {
    this.draw();
    if(isGameStarted && shrink){
      if (this.radius > 0.5 * this.initialRadius) {
        this.radius -= this.radius * 0.00013;
      } else {
        this.radius -= this.radius * 0.00022;
      }
    }
  }
}

class Dodgeball {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.dx = 0;
    this.dy = 0;
    this.radius = radius;
    this.taken = false;
    this.closestObject = [];
    this.closestObjectDistance = 0;
    this.isVisible = false;
  }

  resize(oldCanvasWidth, oldCanvasHeight) {
    this.x = this.x * canvas.width / oldCanvasWidth;
    this.y = this.y * canvas.height / oldCanvasHeight;

    this.x = Math.min(this.x, border.x + border.radius - this.radius);
    this.y = Math.min(this.y, border.y + border.radius - this.radius);


    this.radius = border.initialRadius / 50;
  }

  draw() {
    if (this.isVisible) {
      c.beginPath();
      c.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
      c.fillStyle = player.canCatch ? 'green':'red';
      c.fill();
    }
  }

  updateClosestObject(allObjects) {
    const distances = allObjects.map(obj => ({
      object: obj,
      distance: Math.hypot(this.x - obj.x, this.y - obj.y)
    }));

    distances.sort((a, b) => a.distance - b.distance);

    this.closestObject = distances[0].object;
    this.closestObjectDistance = distances[0].distance;
  }


  update() {
    const friction = 0.99;
    this.dx *= friction;
    this.dy *= friction;

    let nextX = this.x + this.dx;
    let nextY = this.y + this.dy;

    let angle = Math.atan2(nextY - canvas.height / 2, nextX - canvas.width / 2);

    let distanceToCenter = Math.sqrt(Math.pow(nextX - canvas.width / 2, 2) + Math.pow(nextY - canvas.height / 2, 2));

    const velocity = Math.sqrt(this.dx ** 2 + this.dy ** 2);

    if (distanceToCenter + this.radius > border.radius) {
      if (velocity > 0.04) {
      let normal = { x: Math.cos(angle), y: Math.sin(angle) };
      let dot = this.dx * normal.x + this.dy * normal.y;

      this.dx -= 2 * dot * normal.x;
      this.dy -= 2 * dot * normal.y;
      } else {
        this.x = canvas.width / 2 + (border.radius - this.radius) * Math.cos(angle);
        this.y = canvas.height / 2 + (border.radius - this.radius) * Math.sin(angle);
      }
    } else {
      this.x = nextX;
      this.y = nextY;
    }

    this.draw();
    this.updateClosestObject([...enemies, player]);
  }
}

class Player {
  constructor(x, y, radius, color, initialRadius, nickname) {
    this.x = x;
    this.y = y;
    this.dx = 0;
    this.dy = 0;
    this.radius = radius;
    this.color = color;
    this.throwPower = initialRadius/23.0; // 11.1 at 260
    this.initialStamina = initialRadius/2.6; // 100 at 260
    this.stamina = this.initialStamina;
    this.canPickUp = true;
    this.accelerating = false;
    this.canCatch = true;
    this.caughtWhileAccelerating = false;
    this.isDead = false;
    this.closestObjects = [];
    this.shield = true;
    this.nickname = nickname;
  }

  resize(oldCanvasWidth, oldCanvasHeight) {
    this.x = this.x * canvas.width / oldCanvasWidth;
    this.y = this.y * canvas.height / oldCanvasHeight;

    this.radius = canvas.height/40

    this.throwPower = border.initialRadius / 24.0;
    this.initialStamina = border.initialRadius / 2.6;
    this.stamina = this.initialStamina;
  }


  draw() {
    // Create a radial gradient (inner, middle, and outer color)
    let gradient = c.createRadialGradient(this.x, this.y, this.radius / 2, this.x, this.y, this.radius);
    gradient.addColorStop(0, 'white');
    gradient.addColorStop(0.5, this.color);
    gradient.addColorStop(1, 'black');

    // Draw the player with the gradient
    c.beginPath();
    c.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
    c.fillStyle = gradient;
    c.fill();

    // Add a shadow for a 3D effect
    c.shadowBlur = 20;
    c.shadowColor = 'black';

    this.drawStaminaBar();

    if (this.shield) {
      c.beginPath();
      c.arc(this.x, this.y, this.radius + (border.initialRadius/145), 0, Math.PI * 2, false);
      c.strokeStyle = 'rgba(113, 29, 176, 1)';
      c.lineWidth = this.radius/10;    
      c.stroke();
    }

    // Reset shadow for other drawings
    c.shadowBlur = 0;

    c.font = `${border.initialRadius / 25}px Arial`;
    c.fillStyle = 'red';
    c.textAlign = 'center';
    c.fillText(this.nickname, this.x, this.y - this.radius - (border.initialRadius/25)); 
  }

  roundedRect(c, x, y, width, height, radius) {
    c.beginPath();
    c.moveTo(x + radius, y);
    c.lineTo(x + width - radius, y);
    c.arcTo(x + width, y, x + width, y + radius, radius);
    c.lineTo(x + width, y + height - radius);
    c.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    c.lineTo(x + radius, y + height);
    c.arcTo(x, y + height, x, y + height - radius, radius);
    c.lineTo(x, y + radius);
    c.arcTo(x, y, x + radius, y, radius);
    c.closePath();
  }

  drawStaminaBar() {
    let barWidth = this.radius * 2;
    let barHeight = this.radius * 0.3;
    let barX = this.x - barWidth / 2;
    let barY = this.y + this.radius + 5;
    let radius = border.initialRadius/89 ;

    // outline
    c.beginPath();
    this.roundedRect(c, barX, barY, barWidth, barHeight, radius);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    c.stroke();
    c.closePath();

    // fill
    c.beginPath();
    this.roundedRect(c, barX, barY, (this.stamina / this.initialStamina) * barWidth, barHeight, radius);
    c.fillStyle = 'blue';
    c.fill();
    c.closePath();
  }

  updateClosestObjects(allObjects) {
    const distances = allObjects.map(obj => ({
      object: obj,
      distance: Math.hypot(this.x - obj.x, this.y - obj.y)
    }));

    distances.sort((a, b) => a.distance - b.distance);

    this.closestObjects = distances.slice(0, 2).map(item => item.object);
  }

  update() {
    if (this.accelerating) {
      dash.play();
      if (this.dx !== 0 || this.dy !== 0){
      this.stamina -= this.initialStamina * 0.0035;
      } 
    } 
    let nextX = this.x + this.dx;
    let nextY = this.y + this.dy;
    let distanceToCenter = Math.sqrt(Math.pow(nextX - canvas.width / 2, 2) + Math.pow(nextY - canvas.height / 2, 2));

    if (distanceToCenter + this.radius > border.radius) {
      let angle = Math.atan2(nextY - canvas.height / 2, nextX - canvas.width / 2);
      this.x = canvas.width / 2 + (border.radius - this.radius) * Math.cos(angle);
      this.y = canvas.height / 2 + (border.radius - this.radius) * Math.sin(angle);
    } else {
      this.x = nextX;
      this.y = nextY;
    }

    if (this.dx !== 0 || this.dy !== 0) {
      this.stamina -= this.initialStamina * 0.00035;
    } else{
      this.stamina += this.initialStamina * 0.0055;
    }

    if (this.stamina < 0) {
      this.stamina = 0;
    } else if (this.stamina > this.initialStamina) {
      this.stamina = this.initialStamina;
    }
    
    let velocity = Math.sqrt(dodgeball.dx ** 2 + dodgeball.dy ** 2);
    this.canCatch = velocity < this.stamina * 0.063;

    if(!this.isDead){
     this.draw();
    }
    this.updateClosestObjects([...enemies]);
  }

  pickUp(dodgeball) {
    const dist = Math.hypot(this.x - dodgeball.x, this.y - dodgeball.y);
    if (dist - this.radius - dodgeball.radius <= 0
      && isPlayerHoldingDodgeball === false 
      && enemies.every(enemy => !enemy.hasBall)
      ){
        if(this.canCatch) {
          gsap.to(dodgeball, { x: this.x, y: this.y, dx:0, dy:0, duration: 0.5 });
          this.dx = 0;
          this.dy = 0;
          isPlayerHoldingDodgeball = true;
          Enemy.canCatch = false;
          if (this.accelerating) {
            this.caughtWhileAccelerating = true;
          }
          this.isDead = false;
          enemies.forEach(enemy => enemy.canGet = true);
          // enemy.isDead = false;
      } else if (!this.isDead){
        if (this.shield) {
          setTimeout( () => {
            this.shield = false;
          }, 125);
          document.getElementById('gameCanvas').classList.add('mediumShake');
          for (let i = 0; i < 2; i++) {
                particles.push(new Particle(this.x, this.y, Math.random() * (this.radius*0.25 - this.radius*0.05) + this.radius*0.05, this.color, { x: (Math.random() - 0.75)* (border.initialRadius/85), y: (Math.random() - 0.75) *(border.initialRadius/85)}));
              }
          shieldDown.play();
          setTimeout(function() {
            document.getElementById('gameCanvas').classList.remove('mediumShake');
          }, 1000);
        } else {
          this.isDead = true;
          document.getElementById('gameCanvas').classList.add('largeShake');
          for (let i = 0; i < 14; i++) {
            particles.push(new Particle(this.x, this.y, Math.random() * (this.radius*0.45 - this.radius*0.1) + this.radius*0.1, this.color, { x: (Math.random() - 0.75)* (border.initialRadius/110), y: (Math.random() - 0.75) * (border.initialRadius/110),}));
          }
          gameOverAudio.play();
          setTimeout(function() {
            document.getElementById('gameCanvas').classList.remove('largeShake');
            modalEl.style.display = 'flex';
            gameOver = true
            // const containerIds = ["responsive-banner-container-1", "responsive-banner-container-2"];
            // for (let id of containerIds) {
            //   // window.CrazyGames.SDK.banner.requestResponsiveBanner(id, callback);
            // }
          }, 1200);
          dashButton.style.display = 'none';
          joystick = null;
          joyDiv.style.display = 'none';
          let audioElements = [shieldDown, death, backgroundMusic]; 
          audioElements.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
          });
        }
      }
    }
  }

  throw(dodgeball, angle) {
    
    if (isPlayerHoldingDodgeball) {
      
      gsap.killTweensOf(dodgeball);
      dodgeball.dx = (this.throwPower) * Math.cos(angle);
      dodgeball.dy = (this.throwPower) * Math.sin(angle);  
    }
  }
}

class Enemy {
  constructor(x, y, radius, color, initialRadius, nickname) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.dx = 0;
    this.dy = 0;
    this.speed = initialRadius/70; //3 at 260
    this.initialStamina = initialRadius/2.6; // 100 at 260
    this.stamina = this.initialStamina;
    this.throwPower = initialRadius/25.0; // 11 at 260
    this.hasBall = false;
    this.canCatch = true;
    this.atBorder = false;
    this.safeDistance = (Math.random() * (1 - 0.9) + 0.9);
    this.normalDistance = (Math.random() * (0.9 - 0.7) + 0.7);
    this.emergencyDistance = (Math.random() * (0.7 - 0.5) + 0.5);
    this.reactionTime = Math.random() * (300 - 100) + 100;
    this.isDead = false;
    this.closestObjects = [];
    this.canGet = true;
    this.dodging = false;
    this.shield = true;
    this.nickname = nickname;
  }

  resize(oldCanvasWidth, oldCanvasHeight) {
    this.x = this.x * canvas.width / oldCanvasWidth;
    this.y = this.y * canvas.height / oldCanvasHeight;

    this.radius = canvas.height/40;

    this.speed = border.initialRadius / 65.0;
    this.initialStamina = border.initialRadius / 2.6;
    this.stamina = this.initialStamina;
    this.throwPower = border.initialRadius / 25.0;
  }

  draw() {
    c.beginPath();
    c.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
    c.fillStyle = this.color;
    c.closePath();
    c.fill()
    this.drawStaminaBar();

    if (this.shield) {
      c.beginPath();
      c.arc(this.x, this.y, this.radius + (border.initialRadius/145), 0, Math.PI * 2, false);
      c.strokeStyle = this.color;
      c.lineWidth = this.radius/10;    
      c.stroke();
    }

    c.font = `${border.initialRadius / 25}px Arial`;
    c.fillStyle = 'black';
    c.textAlign = 'center';
    c.fillText(this.nickname, this.x, this.y - this.radius - (border.initialRadius/45));
  }

  drawStaminaBar() {
    let barWidth = this.radius * 2;
    let barHeight = this.radius * 0.3;
    let barX = this.x - barWidth / 2;
    let barY = this.y + this.radius + 5;
    let radius = border.initialRadius/89 ;

    // outline
    c.beginPath();
    player.roundedRect(c, barX, barY, barWidth, barHeight, radius);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    c.stroke();
    c.closePath();

    // fill
    c.beginPath();
    player.roundedRect(c, barX, barY, (this.stamina / this.initialStamina) * barWidth, barHeight, radius);
    c.fillStyle = 'blue';
    c.fill();
    c.closePath();
  }

  updateClosestObjects(allObjects) {
    const distances = allObjects.map(obj => ({
      object: obj,
      distance: Math.hypot(this.x - obj.x, this.y - obj.y)
    }));

    distances.sort((a, b) => a.distance - b.distance);

    this.closestObjects = distances.slice(1, 3).map(item => item.object);
  }

  normalMove(angle) {
    this.dx = Math.cos(angle) * this.speed;
    this.dy = Math.sin(angle) * this.speed;
  }

  quickMove(angle) {
    this.dx = Math.cos(angle) * (border.initialRadius/40); // 4 at 260
    this.dy = Math.sin(angle) *(border.initialRadius/40);
    this.stamina -= this.initialStamina * 0.0015;
  }

  pickUp(dodgeball) {
    const dist = Math.hypot(this.x - dodgeball.x, this.y - dodgeball.y);
    if (dist - this.radius - dodgeball.radius <= 0
      && !this.hasBall 
      && (enemies.every(enemy => !enemy.hasBall)) 
      && !isPlayerHoldingDodgeball){
        if (this.canCatch) {
          return new Promise(resolve => {
            let newX = this.x;
            let newY = this.y;
  
            if (Math.hypot(newX - border.x, newY - border.y) + dodgeball.radius > border.radius) {
              let angle = Math.atan2(newY - border.y, newX - border.x);
              newX = border.x + Math.cos(angle) * (border.radius - dodgeball.radius);
              newY = border.y + Math.sin(angle) * (border.radius - dodgeball.radius);
            }
  
            gsap.to(dodgeball, { 
              x: newX, 
              y: newY, 
              dx:0, 
              dy:0, 
              duration: 0.3,
              onComplete: resolve
            });
            this.dx = 0;
            this.dy = 0;
            this.hasBall = true;
            this.isDead = false;
            player.isDead = false;
            enemies.forEach(enemy => enemy.canGet = true);
          });
        } else if (!this.isDead) {
            if (this.shield) {
              setTimeout( () => {
                this.shield = false;          
              }, 125);
              document.getElementById('gameCanvas').classList.add('smallShake');
              for (let i = 0; i < 2; i++) {
                particles.push(new Particle(this.x, this.y, Math.random() * (this.radius*0.25 - this.radius*0.05) + this.radius*0.05, this.color, { x: (Math.random() - 0.75)* (border.initialRadius/85), y: (Math.random() - 0.75) *(border.initialRadius/85)}));
              }
              shieldDown.play();
              setTimeout(function() {
                document.getElementById('gameCanvas').classList.remove('smallShake');
              }, 1000);
            } else {
              this.isDead = true;
              document.getElementById('gameCanvas').classList.add('mediumShake');
              for (let i = 0; i < 14; i++) {
                particles.push(new Particle(this.x, this.y, Math.random() * (this.radius*0.45 - this.radius*0.1) + this.radius*0.1, this.color, { x: (Math.random() - 0.75)* (border.initialRadius/110), y: (Math.random() - 0.75) * (border.initialRadius/110),}));
              }
              death.play();
              enemies = enemies.filter(enemy => enemy !== this)
              setTimeout(function() {
                document.getElementById('gameCanvas').classList.remove('mediumShake');
              }, 1000);
            }
        }
    }
    return Promise.resolve();
  }

  getDodgeball(accn = 1) {
    setTimeout(() => {
      let directionX = dodgeball.x - this.x;
      let directionY = dodgeball.y - this.y;
      let angle = Math.atan2(directionY, directionX);
      this.dx = Math.cos(angle) * this.speed * accn;
      this.dy = Math.sin(angle) * this.speed * accn; 
    }, this.reactionTime); 
  }

  shoot(dodgeball) {
      if (this.hasBall) {

        // gsap.killTweensOf(dodgeball);

        let targetObject;
        if (this.closestObjects.length < 2) {
          targetObject = this.closestObjects[0];
        } else {
            const closestObjectsDistance = Math.hypot(
            this.closestObjects[0].x - this.closestObjects[1].x,
            this.closestObjects[0].y - this.closestObjects[1].y
          );
    
          if (closestObjectsDistance < border.initialRadius / 4) {
            targetObject =
              this.closestObjects[Math.floor(Math.random() * this.closestObjects.length)];
          } else {
            targetObject = this.closestObjects[0];
          }
        }
        
        const directionX = targetObject.x - this.x;
        const directionY = targetObject.y - this.y;
        const angle = Math.atan2(directionY, directionX);
        
          dodgeball.dx = Math.cos(angle) * this.throwPower;
          dodgeball.dy = Math.sin(angle) * this.throwPower;
        
      }   
  
    const dist = Math.hypot(this.x - dodgeball.x, this.y - dodgeball.y);
  
    if (dist - this.radius - dodgeball.radius > 1) {
      this.hasBall = false;
      this.canCatch = false;
      Dodgeball.taken = false;
    }
  }

  isBallMovingTowards() {
    let predictionTime = 2.5; 
    let futureBallX = dodgeball.x + dodgeball.dx * predictionTime;
    let futureBallY = dodgeball.y + dodgeball.dy * predictionTime;

    let directionX = this.x - futureBallX;
    let directionY = this.y - futureBallY;
    let directionMagnitude = Math.sqrt(directionX ** 2 + directionY ** 2);
    let directionNormalizedX = directionX / directionMagnitude;
    let directionNormalizedY = directionY / directionMagnitude;

    let ballVelocityMagnitude = Math.sqrt(dodgeball.dx ** 2 + dodgeball.dy ** 2);
    let ballVelocityNormalizedX = dodgeball.dx / ballVelocityMagnitude;
    let ballVelocityNormalizedY = dodgeball.dy / ballVelocityMagnitude;

    let dotProduct = directionNormalizedX * ballVelocityNormalizedX + directionNormalizedY * ballVelocityNormalizedY;

    return dotProduct > 0.1;
  }
  movement(){
    let distFromBall = Math.hypot(this.x - dodgeball.x, this.y - dodgeball.y);
    if (!isPlayerHoldingDodgeball 
        && this.canCatch 
        && !enemies.some(enemy => enemy !== this && enemy.hasBall)
        && this.canGet
        ) {
        let quickGetSpeed = 1.5 + Math.random() * (1.8 - 1.5);
        if (distFromBall < border.radius * 0.7) {
          if (distFromBall < border.radius * 0.5) {
            if (distFromBall < border.radius * 0.3) {
              if (distFromBall - dodgeball.closestObjectDistance < 0.01 * border.radius) {
                if (Math.random() < 0.75) {
                  this.getDodgeball(quickGetSpeed);
                } else {
                  this.getDodgeball(1);
                }
              } else {
                this.canGet = false;
              }
            } else if (distFromBall - dodgeball.closestObjectDistance < 0.05 * border.radius) {
              if (Math.random() < 0.75) {
                this.getDodgeball(quickGetSpeed);
              } else {
                this.getDodgeball(1);
              }
            } else {
                this.canGet = false;
            }
          } else if (distFromBall - dodgeball.closestObjectDistance < 0.25 * border.radius) {
            if (Math.random() < 0.75) {
              this.getDodgeball(quickGetSpeed);
            } else {
              this.getDodgeball(1);
            }
          } else {
            this.canGet = false;
          }
        } else{
            this.getDodgeball(1);
        }
      //     if (distFromBall - dodgeball.closestObjectDistance < 0.1 * border.radius) {
      //       if (Math.random() < 0.75) {
      //         this.getDodgeball(1.7);
      //       } else {
      //         this.getDodgeball(1);
      //       }
      //     } else{
      //       this.canGet = false;
      //     }
      //   } else{
      //       this.getDodgeball(1);
      //   }
      // this.getDodgeball(1);
    } else {
        let directionX = this.x - dodgeball.x;
        let directionY = this.y - dodgeball.y;
        let distance = Math.sqrt(directionX ** 2 + directionY ** 2);
        let angle = Math.atan2(directionY, directionX);
        const closestObjectsDistance = Math.hypot(
          this.x - this.closestObjects[0].x,
          this.y - this.closestObjects[0].y
        )

        let closestX = this.x - this.closestObjects[0].x;
        let closestY = this.y - this.closestObjects[0].y;
        let closestAngle = Math.atan2(closestY, closestX);

        let ballMovingTowardsEnemy = this.isBallMovingTowards();

        if (ballMovingTowardsEnemy) {

          if (!this.dodging) {
            this.dodging = true;
        
            let offset;
            if (Math.random() < 0.5) {
              offset = Math.PI / 2; // Dodge to the right
            } else {
              offset = -Math.PI / 2; // Dodge to the left
            }
        
            let dodgeAngle;
            if (distance < border.initialRadius * 0.15) {
              let angleToBall = Math.atan2(dodgeball.y - this.y, dodgeball.x - this.x);
              dodgeAngle = angleToBall + offset;
            } else {
              // If the dodgeball is not very close, dodge to the side of the dodgeball's current path
              let ballVelocityAngle = Math.atan2(dodgeball.dy, dodgeball.dx);
              dodgeAngle = ballVelocityAngle + offset;
            }
        
            this.dodgeAngle = dodgeAngle;
          }

            if (distance > 0.25 * border.radius) {
              if (distance > 0.5 * border.radius) {
                if (distance > 0.8 * border.radius) {
                  if (this.stamina > this.initialStamina * 0.8  && !this.atBorder) {
                    this.quickMove(this.dodgeAngle)
                  } else {
                    this.normalMove(angle);
                  }
                } else if (this.stamina > this.initialStamina * 0.6 && distance !== 0.6 * border.radius) {
                  this.quickMove(this.dodgeAngle)
                } else {
                  this.normalMove(this.dodgeAngle);
                }
              } else if (this.stamina > this.initialStamina * 0.4 && distance !== 0.35 * border.radius) {
                this.quickMove(this.dodgeAngle)
              } else {
                this.normalMove(this.dodgeAngle);
              }
            } else if (1) {
              this.quickMove(this.dodgeAngle)
            } else {
              this.normalMove(this.dodgeAngle);
            }
        } else {
          this.dodging = false;
          if (distance < 0.6 * border.radius) {
            this.quickMove(angle) 
          } else if(closestObjectsDistance < border.radius * 0.25) {
          this.normalMove(closestAngle * Math.random() * (1.1 - 0.6) + 0.6);
          } else {
            this.normalMove(angle);
          }
      }
  }
}
  regen() {
    const dist = Math.hypot(this.x - this.radius - dodgeball.x, this.y - this.radius - dodgeball.y);
    let ballMovingTowardsEnemy = this.isBallMovingTowards();
    if (!ballMovingTowardsEnemy) {
      if (this.stamina > this.initialStamina* 0.15) {
        if (this.stamina > this.initialStamina * 0.50) {
          if (this.stamina > this.initialStamina * 0.75) {
            if (dist > this.safeDistance * border.radius && this.stamina !== this.initialStamina) {
              this.dx = 0;  
              this.dy = 0;
            } else if (this.atBorder && dist > this.safeDistance * border.radius) {
              this.dx = 0;
              this.dy = 0;
            }
          } else if (dist > this.normalDistance * border.radius && this.stamina !== this.initialStamina * 0.85) {
            this.dx = 0;
            this.dy = 0;
          }
        } else if (dist > this.emergencyDistance * border.radius && this.stamina !==  this.initialStamina * 0.60) {
          this.dx = 0;
          this.dy = 0;
        }
      } else if (this.stamina !== this.initialStamina * 0.25) {
        this.dx = 0;
        this.dy = 0;
      }
    } 
  }

  update() {
    let nextX = this.x + this.dx;
    let nextY = this.y + this.dy;
    let distanceToCenter = Math.sqrt(Math.pow(nextX - canvas.width / 2, 2) + Math.pow(nextY - canvas.height / 2, 2));

    if (distanceToCenter + this.radius > border.radius) {
      let angle = Math.atan2(nextY - canvas.height / 2, nextX - canvas.width / 2);
      this.x = canvas.width / 2 + (border.radius - this.radius) * Math.cos(angle);
      this.y = canvas.height / 2 + (border.radius - this.radius) * Math.sin(angle);
      this.atBorder = true;
    } else {
      this.atBorder = false;
    }

    if (this.dx !== 0 || this.dy !== 0) {
      this.stamina -= this.initialStamina * 0.00035;
    } else {
      this.stamina += this.initialStamina * 0.0055;
    }

    if (this.stamina < 0) {
      this.stamina = 0;
    } else if (this.stamina > this.initialStamina) {
      this.stamina = this.initialStamina;
    }

    this.dx *= this.stamina / this.initialStamina;
    this.dy *= this.stamina / this.initialStamina;

    let velocity = Math.sqrt(dodgeball.dx ** 2 + dodgeball.dy ** 2);
    this.canCatch = velocity < this.stamina * 0.063;

    let distFromBall = Math.hypot(this.x - dodgeball.x, this.y - dodgeball.y);
    if (!this.canGet){
      this.canGet = dodgeball.closestObjectDistance > 0.25 * border.radius;
    }

    this.x += this.dx;
    this.y += this.dy;

    if (this.hasBall) {
      this.dx = 0;
      this.dy = 0;
    }

    this.updateClosestObjects([...enemies, player]);

    this.draw();
    if(isGameStarted){
      if (!this.hasBall){
        this.movement();
      }
      this.pickUp(dodgeball).then(() => {
        this.shoot(dodgeball, player);
      });
      this.regen();
    }
  }
}

class Particle {
  constructor(x, y, radius, color, velocity) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.velocity = velocity;
    this.alpha = 1;
  }

  draw() {
    c.save();
    c.globalAlpha = this.alpha;
    c.beginPath();
    c.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
    c.fillStyle = this.color;
    c.fill();
    c.restore();
  }

  update() {
    this.draw();
    this.x += this.velocity.x;
    this.y += this.velocity.y;
    this.alpha -= 0.007;
  }
}

let border = new Border();

let player = new Player(canvas.width / 2 + 100, canvas.height / 2 + 100, canvas.height/35, 'hsl(289, 60%, 60%)' ,border.initialRadius);

let isPlayerHoldingDodgeball = false;

let dodgeball

let enemies

let particles

let color;

let isGameStarted = false;

let shrink = true

let countdown = 3;

let joystick

let dashButton = document.createElement('button');

let colors = ['10,40,240', '255, 152, 0', '255,0,150', '255, 0, 0', '240 ,90 ,40', '30, 180, 10' ]

let bgColor

let gameOver = false;
function init(nickname) {

  canvas.width = gameScreen.clientWidth * (dpr);
  canvas.height = gameScreen.clientHeight * (dpr) ;

  canvas.style.width = gameScreen.clientWidth + 'px';
  canvas.style.height =  gameScreen.clientHeight + 'px';


  gameOver = false;
  let randomIndex = Math.floor(Math.random() * colors.length);
  bgColor = colors[randomIndex];

  border = new Border();
  let size;
  let bottom;
  let left;

  if (window.innerWidth > 768) {
    size = window.innerWidth * 0.15;
    bottom = '7%';
    left = '7%';
  } else {
    // For smaller screens, use the original values
    size = window.innerWidth * 0.2;
    bottom = '5%';
    left = '5%';
  }

  joyDiv.style.width = `${size}px`;
  joyDiv.style.height = `${size}px`;
  joyDiv.style.bottom = bottom;
  joyDiv.style.left = left;

  dashButton.style.display = 'none';
  dashButton.style.width = `${size/1.2}px`;
  dashButton.style.height = `${size/1.2}px`;
  dashButton.style.position = 'absolute';
  dashButton.style.bottom = `${parseInt(bottom) + 4}%`; 
  dashButton.style.right = left;
  dashButton.style.backgroundImage = `radial-gradient(circle at center, white, rgb(169, 169, 169))`;
  dashButton.style.color = 'gray'; 
  dashButton.style.border = 'none';
  dashButton.style.borderRadius = '50%';
  dashButton.style.fontSize = `${size/6}px`;
  dashButton.style.fontFamily = "Roboto, sans-serif";
  dashButton.style.fontWeight = 'bold';

  document.body.appendChild(dashButton);

  let angle = Math.random() * Math.PI * 2;
  let distance = (Math.random() * border.initialRadius / 2) + 0.1;
  let dodgeballX = canvas.width / 2 + distance * Math.cos(angle);
  let dodgeballY = canvas.height / 2 + distance * Math.sin(angle);

  dodgeball = new Dodgeball(dodgeballX, dodgeballY, border.initialRadius/55, 0, 0);

  enemies = []

  particles = []

  const playerHue = 289; 
  const hueRange = 45;
  const enemyHueRanges = 7;

  const rangeSize = (360 - 2 * hueRange) / enemyHueRanges;

  let shuffledUsernames = shuffleArray(usernames);

  const totalEntities = parseInt(selectedButton.textContent); 
  const angleBetweenEntities = 2 * Math.PI / totalEntities;

  let playerIndex = Math.floor(Math.random() * totalEntities);

  for (let i = 0; i < totalEntities; i++) {
    let angle = i * angleBetweenEntities;
    let x = canvas.width / 2 + border.initialRadius * Math.cos(angle);
    let y = canvas.height / 2 + border.initialRadius * Math.sin(angle);

    if (i === playerIndex) {
      player = new Player(x, y, canvas.height/40, 'hsl(289, 60%, 60%)' ,border.initialRadius, nickname);
    } else {
        let hue;
        let enemyNickname = shuffledUsernames[i % 7];
        if (i * rangeSize < playerHue - hueRange || i * rangeSize > playerHue + hueRange) {
          hue = i * rangeSize;
        } else {
          hue = (i + enemyHueRanges) * rangeSize;
        }
        color = `hsl(${hue}, 50%, 50%)`;
        enemies.push(new Enemy(x, y, canvas.height/40 , color , border.initialRadius, enemyNickname));
    }
  }

  isPlayerHoldingDodgeball = false;

  countdown = 3;
  let countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);

  setTimeout( () => {
    dodgeball.isVisible = true;
    isGameStarted = true;
  }, 3000);

  let fadeInInterval = setInterval(function() {   
    if (backgroundMusic.volume < 0.1) {
      backgroundMusic.volume += 0.001;
    } else {
      clearInterval(fadeInInterval);
    }
  }, 30);
  
  if ('ontouchstart' in window) {
    joyDiv.style.display = 'block';
    dashButton.style.display = 'block';
    joystick = new JoyStick('joyDiv');
  }
}

let animationFrameId;
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;
let victorySoundPlayed = false;

function animate() { 
 
  c.fillStyle = `rgba(${bgColor}, 0.35)`;
  c.fillRect(0, 0, canvas.width, canvas.height);

  c.beginPath();
  c.arc(border.x, border.y, border.radius, 0, Math.PI * 2, false);
  c.fillStyle = 'rgba(255, 255, 255, 0.65)'; // Change this to the color you want
  c.fill();

  border.update();
  particles.forEach((particle, index) => {
    if (particle.alpha <= 0) {
      particles.splice(index, 1);
    } else {
      particle.update();
    }
  })
  player.update();
  if (!gameOver){
    for (let i = 0; i < enemies.length; i++) {
      enemies[i].update();
    }
  }
  dodgeball.update(enemies, player);

  if (!isGameStarted) {
    c.font = `${border.initialRadius / 4}px Arial`;
    c.fillStyle = 'red';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(countdown, canvas.width / 2, canvas.height / 2);
  }
  
  const dist = Math.hypot(player.x - dodgeball.x, player.y - dodgeball.y);
  if (dist - player.radius - dodgeball.radius> 1) { 
    isPlayerHoldingDodgeball = false;
    player.canCatch = false
  }

  if (!isPlayerHoldingDodgeball && !player.isDead) {
    player.pickUp(dodgeball);
    dashButton.textContent = "DASH"
    shrink = true
  } else {
    dashButton.textContent = "SHOOT"
    setTimeout( () => {
      shrink = false
    }, 1000);
  }  

  frameCount++;
  let now = performance.now();
  let deltaTime = now - lastTime;
  if (deltaTime > 1000) { // If over 1 second has passed
    fps = frameCount;
    frameCount = 0;
    lastTime = now;
  }

  // Display FPS
  c.font = '36px Arial';
  c.fillStyle = 'black';
  c.textAlign = 'right';
  c.textBaseline = 'top';
  c.fillText('FPS: ' + fps, canvas.width - 10, 10);

  let speed
  if (player.accelerating) {
    speed = border.initialRadius/20;
  } else {
    speed = border.initialRadius/60;
  }

  if (!isPlayerHoldingDodgeball && isGameStarted ) {
    if (keys.ArrowRight || keys.d ) player.dx = (speed) * player.stamina / player.initialStamina; //3 at 260
    if (keys.ArrowLeft || keys.a) player.dx = -(speed) * player.stamina / player.initialStamina;
    if (!keys.ArrowRight && !keys.d && !keys.ArrowLeft && !keys.a) player.dx = 0;

    if (keys.ArrowUp || keys.w) player.dy = -(speed) * player.stamina / player.initialStamina;
    if (keys.ArrowDown || keys.s) player.dy = (speed) * player.stamina / player.initialStamina;
    if (!keys.ArrowUp && !keys.w && !keys.ArrowDown && !keys.s) player.dy = 0;
  }

  if (!isPlayerHoldingDodgeball && isGameStarted ) {
    if (keys.ArrowRight || keys.d) player.dx = (speed) * player.stamina / player.initialStamina; //3 at 260
    if (keys.ArrowLeft || keys.a) player.dx = -(speed) * player.stamina / player.initialStamina;
    if (!keys.ArrowRight && !keys.d && !keys.ArrowLeft && !keys.a) player.dx = 0;

    if (keys.ArrowUp || keys.w) player.dy = -(speed) * player.stamina / player.initialStamina;
    if (keys.ArrowDown || keys.s) player.dy = (speed) * player.stamina / player.initialStamina;
    if (!keys.ArrowUp && !keys.w && !keys.ArrowDown && !keys.s) player.dy = 0;
  }

  const speedFactor = 0.0135;

  if (!isPlayerHoldingDodgeball && isGameStarted ) {
    let targetDx = StickStatus.x * (speed) * player.stamina / player.initialStamina;
    let targetDy = -StickStatus.y * (speed) * player.stamina / player.initialStamina;

    player.dx += (targetDx - player.dx) * speedFactor;
    player.dy += (targetDy - player.dy) * speedFactor;
  }

  if (enemies.length === 0 && !victorySoundPlayed) {
    dashButton.style.display = 'none';
    joystick = null;
    joyDiv.style.display = 'none';
    backgroundMusic.pause();

    death.addEventListener('ended', function() {
      if (enemies.length === 0 && !victorySoundPlayed) {
        victorySound.play();
        victorySoundPlayed = true;

        victorySound.addEventListener('ended', function() {
          setTimeout(function() {
            victoryScreen.style.display = "flex";
            player = null;
          }, 50);

          let audioElements = [shieldDown, death, dash]; 
          audioElements.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
          });
        });
      }
    });
  }
  
  animationFrameId =  requestAnimationFrame(animate);
}

const keys = {
  ArrowRight: false,
  ArrowLeft: false,
  ArrowUp: false,
  ArrowDown: false,
  d: false,
  a: false,
  w: false,
  s: false
};

window.addEventListener('keydown', function(e) {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', function(e) {
  keys[e.key.toLowerCase()] = false;
});

window.addEventListener('mouseup', function(event) {
  if (event.button === 0) {
    player.accelerating = false;

    if (isPlayerHoldingDodgeball) {
      if (!player.caughtWhileAccelerating) {
        let angle = Math.atan2(event.clientY - player.y, event.clientX - player.x);
        player.throw(dodgeball, angle);
      } else {
        player.caughtWhileAccelerating = false; 
      }
    }
  }
});

window.addEventListener('mousedown', function(event) {
  if (event.button === 0) {
    player.accelerating = true;
  }
});

window.addEventListener('keydown', function(event) {
  if (event.code === 'Space') {
    player.accelerating = true;
  }
});

window.addEventListener('keyup', function(event) {
  if (event.code === 'Space') {
    player.accelerating = false;

    if (isPlayerHoldingDodgeball) {
      if (!player.caughtWhileAccelerating) {

        let targetObject;

        if (player.closestObjects.length < 2) {
          targetObject = player.closestObjects[0];
        } else {
          const closestObjectsDistance = Math.hypot(
            player.closestObjects[0].x - player.closestObjects[1].x,
            player.closestObjects[0].y - player.closestObjects[1].y
          );
    
          if (closestObjectsDistance < border.initialRadius / 4) {
            targetObject =
              player.closestObjects[Math.floor(Math.random() * player.closestObjects.length)];
          } else {
            targetObject = player.closestObjects[0];
          }
        }
  
        const directionX = targetObject.x - player.x;
        const directionY = targetObject.y - player.y;
        const angle = Math.atan2(directionY, directionX);
      
        player.throw(dodgeball, angle);
      } else {
        player.caughtWhileAccelerating = false; 
      }
    }
  }
});

dashButton.addEventListener('touchstart', function(event) {
  player.accelerating = true;
});

dashButton.addEventListener('touchend', function(event) {
  player.accelerating = false;

  if (isPlayerHoldingDodgeball) {
    if (!player.caughtWhileAccelerating) {

      let targetObject;

      if (player.closestObjects.length < 2) {
        targetObject = player.closestObjects[0];
      } else {
        const closestObjectsDistance = Math.hypot(
          player.closestObjects[0].x - player.closestObjects[1].x,
          player.closestObjects[0].y - player.closestObjects[1].y
        );
  
        if (closestObjectsDistance < border.initialRadius / 4) {
          targetObject =
            player.closestObjects[Math.floor(Math.random() * player.closestObjects.length)];
        } else {
          targetObject = player.closestObjects[0];
        }
      }

      const directionX = targetObject.x - player.x;
      const directionY = targetObject.y - player.y;
      const angle = Math.atan2(directionY, directionX);

      
      player.throw(dodgeball, angle);
    } else {
      player.caughtWhileAccelerating = false; 
    }
  }
});

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function resizeCanvas() {
  let oldCanvasWidth = canvas.width;
  let oldCanvasHeight = canvas.height;

  canvas.width = gameScreen.clientWidth * (dpr);
  canvas.height = gameScreen.clientHeight * (dpr) ;

  // canvas.style.width = gameScreen.clientWidth + 'px';
  // canvas.style.height =  gameScreen.clientHeight + 'px';


  // if (document.fullscreenElement) {
  //   addDpr = 0.1;
  //   adjustDpr(addDpr);
  //   canvas.width = screen.width * (dpr);
  // canvas.height = screen.height * (dpr);
  // } else {
  //   addDpr = 0;
  //   adjustDpr(addDpr);
  //   canvas.width = window.innerWidth * dpr;
  //   canvas.height = window.innerHeight * dpr;
  // }

  console.log('dpr:', dpr);
  console.log('canvas width:', canvas.width);
  console.log('canvas height:', canvas.height);

  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;

  border.resize(oldCanvasWidth, oldCanvasHeight);
  dodgeball.resize(oldCanvasWidth, oldCanvasHeight);
  player.resize(oldCanvasWidth,oldCanvasHeight);
  enemies.forEach(enemy => enemy.resize(oldCanvasWidth, oldCanvasHeight));
  
  // Redraw the canvas content here...
  border.update();
  dodgeball.draw();
  player.draw();
  enemies.forEach(enemy => enemy.draw());
}

let observer = new ResizeObserver(resizeCanvas);
observer.observe(gameScreen);

window.onload = function() {
  let helpScreen = document.getElementById('helpScreen');
  let closeHelpButton = document.getElementById('closeHelpButton');

  if (!localStorage.getItem('isNotNewPlayer')) {
    helpScreen.style.display = 'flex';
  }

  closeHelpButton.onclick = function() {
    helpScreen.style.display = 'none';
    localStorage.setItem('isNotNewPlayer', 'true');
  };
};

// async function storeVictoryMessage() {
//   const victoryMessage = document.getElementById('victoryMessage').value;

//   try {
//     await updateDoc(doc(db, 'victoryMessages', '1n0OSsVpnaF06KD7HbrV'), {
//       messages: arrayUnion(victoryMessage)
//     });
//     console.log('Victory message stored successfully!');
//   } catch (error) {
//     console.error('Error storing victory message: ', error);
//   }
// }

window.addEventListener("wheel", (event) => event.preventDefault(), {
  passive: false,
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", " "].includes(event.key)) {
    if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
      event.preventDefault();
    }
  }
});

document.getElementById('playAgainButton').addEventListener('click', function() {
  storeVictoryMessage();
  this.disabled = true

  // const callbacks = {
  //   adFinished: () => {
  //     console.log("End midgame ad (callback)");
  //     startGame();
  //     document.getElementById('playAgainButton').disabled = false;
  //   },
  //   adError: (error, errorData) => {
  //     console.log("Error midgame ad (callback)", error, errorData);
  //     if (errorData.reason === 'unfilled') {
  //       startGame();
  //     } else if (errorData.reason === 'other') {
  //       startGame();
  //     }
  //     document.getElementById('playAgainButton').disabled = false;
  //   },
  //   adStarted: () => console.log("Start midgame ad (callback)"),
  // };
  
  // try {
  //   window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
  // } catch (error) { 
    // console.log(error);
    startGame();
  // }
});

startButton.addEventListener('click', function(){
  this.disabled = true

  // const callbacks = {
  //   adFinished: () => {
  //     console.log("End midgame ad (callback)");
  //     startGame();
  //     startButton.disabled = false;
  //   },
  //   adError: (error, errorData) => {
  //     console.log("Error midgame ad (callback)", error, errorData);
  //     if (errorData.reason === 'unfilled') {
  //       startGame();
  //     } else if (errorData.reason === 'other') {
  //       startGame();
  //     }
  //     startButton.disabled = false;
  //   },
  //   adStarted: () => console.log("Start midgame ad (callback)"),
  // };
  // try {
  //   window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
  // } catch (error) { 
  //   console.log(error);
    startGame();
  // }
})

const callback = (error, result) => {
  if (error) {
      console.log("Error on request responsive banner (callback)", error);
  } else {
      console.log("End request responsive banner (callback)", result); 
  }
};

function startGame() {
  gameStart.play();

  isGameStarted = false;

  console.log("is it consoling?")

  if (animationFrameId !== undefined) {
    cancelAnimationFrame(animationFrameId);
  }

  let nickname = nicknameEl.value || 'Player'; 

  victoryScreen.style.display = 'none';

  init(nickname);
  modalEl.style.display = 'none';
  backgroundMusic.currentTime = 0;
  backgroundMusic.volume = 0;
  backgroundMusic.play();
  animate();
}

var usernames = [
  "stormy",
  "lioness",
  "solo",
  " Phoenix",
  "独行侠",
  "老王",
  "VAMOS",
  "gondor",
  "ZEUS",
  "flame",
  "tiger",
  "duo",
  " Dragon",
  "孤狼",
  "老李",
  "GO GO GO",
  "Mr. Cool",
  "====",
  "rohan",
  "HERA",
  "blaze",
  " Eagle",
  "独鹰",
  "老张",
  "Ms. Smart",
  "++++",
  "isengard",
  "POSEIDON",
  "spark",
  "cheetah",
  "quad",
  "[YS+] Falcon",
  "孤鹤",
  "老刘",
  "Mr. Funny",
  "----",
  "ATHENA",
  "fire",
  "panther",
  "penta",
  "孤龙",
  "老赵",
  "Ms. Cute",
  "mirkwood",
  "APOLLO",
  "smoke",
  "jaguar",
  "hexa",
  "[YS+] Raven",
  "孤雁",
  "老钱",
  "Mr. Nice",
  "....",
  "rivendell",
  "ARTEMIS",
  "ash",
  "lynx",
  "hepta",
  "[YS+] Crow",
  "孤鸿",
  "老孙",
  "CHOP CHOP",
  "****",
  "lothlorien",
  "APHRODITE",
  "ember",
  "ocelot",
  "octa",
  "[YS+] Owl",
  "孤鹿",
  "老周",
  "Mr. Kind",
  "moria",
  "ARES",
  "coal",
  "puma",
  "nona",
  "[YS+] Vulture",
  "孤鸥",
  "老吴",
  "SPEED UP",
  "Ms. Cool",
  "glow",
  "deca",
  "孤鹰",
  "老陈",
  "minas tirith",
  "HERMES",
  "charcoal",
  "bobcat",
  "老林",
  "blaze",
  "puma",
  "hexa",
  "Condor",
  "孤鸾",
  "老马",
  "Wise",
  "helms deep",
  "ATHENA",
  "graphite",
  "caracal",
  "Parrot",
  "孤鹳",
  "老冯",
  "Witty",
  "mike",
  "THEKING",
  "XXX",
  "SPAIN",
  "soviet",
  "rev-10",
  "A-11",
  "Mellowy",
  "micky",
  "THEROCK",
  "OOO",
  "ESPANA",
  "russia",
  "mikester",
  "THELION",
  "ZZZ",
];
