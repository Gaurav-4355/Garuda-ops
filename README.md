# 🦅 GARUDA-OPS v10

Autonomous Drone Swarm Control & Surveillance System with Reinforcement Learning.

## 📁 Project Structure

```
Garuda-OPS/
├── frontend/                    ← Deploy to Vercel (static)
│   ├── index.html               ← Secure login portal
│   ├── garuda_ops.html          ← Main mission command center
│   ├── css/
│   │   ├── login.css            ← Login page styles
│   │   └── garuda.css           ← Dashboard styles
│   ├── js/
│   │   ├── login.js             ← Auth flow, particles, splash
│   │   └── garuda.js            ← Q-Learning, A*, simulation
│   └── vercel.json              ← Vercel deployment config
│
├── backend/                     ← Deploy to Render (Python)
│   ├── main.py                  ← Pipeline entry point
│   ├── grid.py                  ← Grid map generation
│   ├── planner.py               ← Boustrophedon + A* planner
│   ├── dynamic_replanner.py     ← D* Lite dynamic replanning
│   ├── rl_agent.py              ← Q-Learning agent
│   └── requirements.txt         ← Python dependencies
│
├── README.md
└── .gitignore
```

## 🚀 Features

| Feature | Description |
|---|---|
| **Q-Learning (RL)** | Drone learns obstacle patterns, improves efficiency each mission |
| **A* Pathfinding** | Energy-aware routing with turn-cost penalty that grows with mission number |
| **Boustrophedon Pattern** | Optimal snake-pattern coverage of the surveillance zone |
| **Fog of War** | Dynamic map discovery as drones explore |
| **RTB Protocol** | Auto Return-To-Base on low battery (12%), recharge and resume |
| **Swarm Support** | 1–4 drones operating simultaneously with sectored zones |
| **💾 localStorage** | Q-table & mission history persist across page refreshes |
| **🍞 Toast Alerts** | Real-time slide-in notifications for RTB, obstacles, mission complete |
| **🔊 Voice Alerts** | Web Speech API — spoken announcements for critical events |
| **📊 Live Chart** | Chart.js learning curve showing Efficiency & Replannings per mission |
| **🗺️ Minimap Radar** | Live 90×90 radar overlay with drone blips and scan sweep |
| **📥 JSON Export** | Download full mission report as JSON |

## 🌐 How to Run Locally

1. Open `frontend/index.html` in your browser
2. Login with Operator ID: `Gaurav`, Access Code: `Gaurav@4355`, Clearance: `DELTA`
3. Set surveillance zone coordinates and click **ESTABLISH LINK**
4. Click **🚀 LAUNCH SWARM** — watch drones learn!



## 🧠 How Q-Learning Works

- **Mission 1**: Drone explores randomly (ε=0.90), hits dynamic obstacles, replannings occur
- **Mission 2+**: Memory preloads known obstacles, A* avoids danger zones, fewer replannings
- **Mission 5+**: Epsilon decays to 0.50, Q-values guide straight-path preference
- **Mission 10+**: Near-perfect efficiency, minimal replannings, fully learned map

---
Developed for GARUDA-OPS Swarm Command | v10
