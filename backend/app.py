"""
backend/app.py - Production FastAPI Backend & Server for GARUDA-OPS
Includes Reinforcement Learning (Q-Learning) engine, A* Boustrophedon Planner,
Dynamic Obstacle Replanning API, and static frontend hosting.
"""

import os
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import json
import math
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Import existing backend modules
sys.path.insert(0, os.path.dirname(__file__))
from grid import Grid, create_sample_map, FREE, OBSTACLE, NO_FLY, START, VISITED
from planner import CoveragePlanner, astar, boustrophedon_path
from rl_agent import DroneMemory, QLearningDrone, ACTIONS, ALPHA, GAMMA, EPSILON_MIN, EPSILON_START, EPSILON_DECAY

app = FastAPI(
    title="GARUDA-OPS Autonomous Swarm AI",
    description="Reinforcement Learning and Path Optimization Backend",
    version="3.2.0"
)

# Enable CORS for local development and deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Persistent Q-Learning Memory
global_memory = DroneMemory()

# ── Pydantic Request Models ───────────────────────────────────
class PlanRequest(BaseModel):
    rows: int = 20
    cols: int = 20
    drones_count: int = 2
    obstacles: List[List[int]] = []
    no_fly_zones: List[List[int]] = []
    start_pos: List[int] = [0, 0]

class RLStepRequest(BaseModel):
    mission_num: int = 1
    state: List[int]
    action_idx: Optional[int] = None
    reward: float = 0.0
    next_state: Optional[List[int]] = None
    known_obstacles: List[List[int]] = []

class DynamicObsRequest(BaseModel):
    current_pos: List[int]
    obstacle_pos: List[int]
    remaining_path: List[List[int]]

# ── API Routes ────────────────────────────────────────────────
@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health_check():
    return {
        "status": "ONLINE",
        "system": "GARUDA-OPS SWARM AI",
        "version": "3.2.0",
        "rl_active": True,
        "missions_recorded": global_memory.mission_count
    }

@app.post("/api/plan")
async def compute_coverage_plan(req: PlanRequest):
    try:
        grid = Grid(rows=req.rows, cols=req.cols)
        grid.set_start(req.start_pos[0], req.start_pos[1])
        
        for r, c in req.obstacles:
            grid.add_obstacle(r, c)
        for r1, r2, c1, c2 in req.no_fly_zones:
            grid.add_no_fly_zone(r1, r2, c1, c2)

        planner = CoveragePlanner(grid, battery=1200.0)
        planned_path = planner.plan()
        
        # Partition path for multi-drone swarm
        sec_w = math.ceil(req.cols / req.drones_count)
        drone_paths = []
        for i in range(req.drones_count):
            c0 = i * sec_w
            c1 = min(c0 + sec_w, req.cols)
            sector_waypoints = []
            for r in range(req.rows):
                sweep = range(c0, c1) if r % 2 == 0 else range(c1 - 1, c0 - 1, -1)
                for c in sweep:
                    if grid.is_free(r, c):
                        sector_waypoints.append([r, c])
            drone_paths.append(sector_waypoints)

        return {
            "success": True,
            "total_waypoints": len(planned_path),
            "full_path": planned_path,
            "drone_paths": drone_paths,
            "coverage_pct": grid.coverage_percentage()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rl/train")
async def rl_train_step(req: RLStepRequest):
    try:
        grid_sample = [[0]*20 for _ in range(20)]
        drone = QLearningDrone(grid_data=grid_sample, memory=global_memory, mission_num=req.mission_num)
        state_tuple = (req.state[0], req.state[1])
        
        action_idx = req.action_idx
        if action_idx is None:
            action_idx = global_memory.best_action(state_tuple)

        if req.next_state is not None:
            next_tuple = (req.next_state[0], req.next_state[1])
            old_q = global_memory.get_q(state_tuple, action_idx)
            next_max_q = max(global_memory.get_q(next_tuple, a) for a in range(len(ACTIONS)))
            new_q = old_q + ALPHA * (req.reward + GAMMA * next_max_q - old_q)
            global_memory.set_q(state_tuple, action_idx, new_q)

        for ob in req.known_obstacles:
            global_memory.record_obstacle(ob[0], ob[1], req.mission_num)

        return {
            "success": True,
            "action_idx": action_idx,
            "epsilon": drone.epsilon,
            "q_states_count": len(global_memory.q_table),
            "danger_cells_count": len(global_memory.danger_map),
            "known_obstacles_count": len(global_memory.obstacle_memory)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/replan")
async def dynamic_replan(req: DynamicObsRequest):
    try:
        grid = create_sample_map(rows=20, cols=20)
        obs_r, obs_c = req.obstacle_pos
        grid.add_obstacle(obs_r, obs_c)
        global_memory.record_obstacle(obs_r, obs_c, 1)

        cur_r, cur_c = req.current_pos
        valid_remaining = [wp for wp in req.remaining_path if not (wp[0] == obs_r and wp[1] == obs_c)]
        
        if valid_remaining:
            next_target = valid_remaining[0]
            bypass = astar(grid, (cur_r, cur_c), (next_target[0], next_target[1]))
            bypass_path = bypass.get("path", []) if isinstance(bypass, dict) else (bypass if isinstance(bypass, list) else [])
            new_path = bypass_path + valid_remaining[1:]
        else:
            new_path = []

        return {
            "success": True,
            "new_path": new_path,
            "obstacle_recorded": [obs_r, obs_c]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Static Frontend Mount ─────────────────────────────────────
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

if os.path.exists(frontend_dir):
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_dir, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_dir, "js")), name="js")

    @app.api_route("/", methods=["GET", "HEAD"])
    async def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"), media_type="text/html")

    @app.api_route("/index.html", methods=["GET", "HEAD"])
    async def serve_index_html():
        return FileResponse(os.path.join(frontend_dir, "index.html"), media_type="text/html")

    @app.api_route("/garuda_ops.html", methods=["GET", "HEAD"])
    async def serve_garuda_ops():
        return FileResponse(os.path.join(frontend_dir, "garuda_ops.html"), media_type="text/html")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3000))
    print(f"[GARUDA-OPS] Starting Unified Server on http://localhost:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
