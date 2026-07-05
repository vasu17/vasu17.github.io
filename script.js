document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);

    const ctx = canvas.getContext('2d');
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const SPACING = 60;       // px between nodes
    const NODE_R = 3;         // node ring radius

    // Colors
    const CIRCUIT_NODE  = 'rgba(160, 20, 35, 0.22)'; // dim red hollow ring
    const CIRCUIT_EDGE  = 'rgba(160, 20, 35, 0.12)'; // dim red line
    const CURRENT_COLOR = 'rgba(0, 229, 255, 0.80)'; // cyan travelling line

    let cols, rows;

    // Adjacency list: key "c,r" -> array of {c, r} neighbors (all below current row)
    let adjacencyList = new Map();
    // A Set to track occupied nodes "c,r" to prevent overlaps
    let occupiedNodes = new Set();
    // A Map to store active actual glow intensity (0.0 -> 1.0) for each node
    let nodeIntensities = new Map();
    let pulses = [];

    // Helper functions to get pixel coordinates with offscreen margins
    // So row r = 0 is at y = -SPACING (above viewport)
    // And row rows-1 is at y >= height + SPACING (below viewport)
    function getNodeX(c) {
        return (c - 0.5) * SPACING;
    }

    function getNodeY(r) {
        return (r - 1) * SPACING;
    }

    // Generate randomized graph between nodes (flowing downwards/diagonally downwards)
    function generateGraph() {
        adjacencyList.clear();
        cols = Math.ceil(width / SPACING) + 2;
        rows = Math.ceil(height / SPACING) + 2;

        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols; c++) {
                const key = `${c},${r}`;
                const neighbors = [];

                // 1. Vertical down edge (high probability to ensure connectivity)
                if (Math.random() < 0.85) {
                    neighbors.push({ c, r: r + 1 });
                }
                // 2. Diagonal down-left edge
                if (c > 0 && Math.random() < 0.25) {
                    neighbors.push({ c: c - 1, r: r + 1 });
                }
                // 3. Diagonal down-right edge
                if (c < cols - 1 && Math.random() < 0.25) {
                    neighbors.push({ c: c + 1, r: r + 1 });
                }

                // If no neighbor was generated, force vertical down edge to prevent dead ends
                if (neighbors.length === 0) {
                    neighbors.push({ c, r: r + 1 });
                }

                adjacencyList.set(key, neighbors);
            }
        }
    }

    // Generates a path from the very top (r = 0) to the very bottom (r = rows - 1)
    function generatePathFromTopToBottom() {
        let path = [];
        let c = Math.floor(Math.random() * cols);
        let r = 0;
        path.push({ c, r });

        while (r < rows - 1) {
            const neighbors = adjacencyList.get(`${c},${r}`);
            if (!neighbors || neighbors.length === 0) break;
            
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            c = next.c;
            r = next.r;
            path.push({ c, r });
        }
        return path;
    }

    class Pulse {
        constructor(path) {
            this.path = path.map(pt => ({
                c: pt.c,
                r: pt.r,
                x: getNodeX(pt.c),
                y: getNodeY(pt.r)
            }));
            
            // Calculate distance metrics along path
            this.path[0].dist = 0;
            for (let i = 1; i < this.path.length; i++) {
                const p1 = this.path[i-1];
                const p2 = this.path[i];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                p2.dist = p1.dist + len;
            }
            
            this.totalLength = this.path[this.path.length - 1].dist;
            
            // Pulse head travels from 0 to totalLength + SPACING (tail exit)
            this.distance = 0;
            this.speed = 0.35 + Math.random() * 0.25; 
            this.alive = true;

            // Reserve all nodes along this path
            for (const pt of this.path) {
                occupiedNodes.add(`${pt.c},${pt.r}`);
            }
        }

        update() {
            if (!this.alive) return false;

            this.distance += this.speed;
            const tailDist = this.distance - SPACING;
            
            // Release occupancy of nodes as the tail passes them
            for (const pt of this.path) {
                if (pt.dist < tailDist) {
                    occupiedNodes.delete(`${pt.c},${pt.r}`);
                }
            }

            if (tailDist >= this.totalLength) {
                this.alive = false;
            }

            return this.alive;
        }

        getPathSegments() {
            const headDist = Math.max(0, Math.min(this.totalLength, this.distance));
            const tailDist = Math.max(0, Math.min(this.totalLength, this.distance - SPACING));

            const segments = [];

            // Add tail coordinate
            segments.push(this.getPointAtDist(tailDist));

            // Add intermediate nodes
            for (const pt of this.path) {
                if (pt.dist > tailDist && pt.dist < headDist) {
                    segments.push({ x: pt.x, y: pt.y });
                }
            }

            // Add head coordinate
            segments.push(this.getPointAtDist(headDist));

            return segments;
        }

        getPointAtDist(d) {
            if (d <= 0) return { x: this.path[0].x, y: this.path[0].y };
            const last = this.path[this.path.length - 1];
            if (d >= last.dist) return { x: last.x, y: last.y };

            for (let i = 0; i < this.path.length - 1; i++) {
                const p1 = this.path[i];
                const p2 = this.path[i+1];
                if (d >= p1.dist && d <= p2.dist) {
                    const ratio = (d - p1.dist) / (p2.dist - p1.dist);
                    return {
                        x: p1.x + (p2.x - p1.x) * ratio,
                        y: p1.y + (p2.y - p1.y) * ratio
                    };
                }
            }
            return { x: last.x, y: last.y };
        }

        illuminateNodes(activeNodesMap) {
            const headDist = Math.max(0, Math.min(this.totalLength, this.distance));
            const tailDist = Math.max(0, Math.min(this.totalLength, this.distance - SPACING));

            for (const pt of this.path) {
                if (pt.dist >= tailDist && pt.dist <= headDist) {
                    activeNodesMap.set(`${pt.c},${pt.r}`, true);
                }
            }
        }

        forceCleanup() {
            for (const pt of this.path) {
                occupiedNodes.delete(`${pt.c},${pt.r}`);
            }
        }
    }

    // Initialize layout
    function init() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        occupiedNodes.clear();
        nodeIntensities.clear();
        generateGraph();
        pulses = [];
    }

    init();
    window.addEventListener('resize', init);

    // Animation Loop
    function animate() {
        ctx.clearRect(0, 0, width, height);

        // 1. Draw static graph edges (circuit lines) - dim red
        ctx.beginPath();
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = CIRCUIT_EDGE;
        for (const [key, neighbors] of adjacencyList.entries()) {
            const [cStr, rStr] = key.split(',');
            const c = parseInt(cStr);
            const r = parseInt(rStr);
            const startX = getNodeX(c);
            const startY = getNodeY(r);

            for (const neighbor of neighbors) {
                ctx.moveTo(startX, startY);
                ctx.lineTo(getNodeX(neighbor.c), getNodeY(neighbor.r));
            }
        }
        ctx.stroke();

        // 2. Spawn pulses at the top row (r = 0, offscreen) randomly, ensuring no overlap
        if (Math.random() < 0.08 && pulses.length < 25) {
            const potentialPath = generatePathFromTopToBottom();
            
            // Check path conflict with existing active path node locks
            let conflict = false;
            for (const pt of potentialPath) {
                if (occupiedNodes.has(`${pt.c},${pt.r}`)) {
                    conflict = true;
                    break;
                }
            }

            if (!conflict) {
                pulses.push(new Pulse(potentialPath));
            }
        }

        // 3. Update active pulses
        pulses = pulses.filter(pulse => {
            const active = pulse.update();
            if (!active) {
                pulse.forceCleanup(); // Free occupancy on termination
            }
            return active;
        });

        // 4. Collect currently target illuminated nodes
        const targetNodes = new Map();
        for (const pulse of pulses) {
            pulse.illuminateNodes(targetNodes);
        }

        // 5. Draw static grid nodes (hollow rings)
        // Nodes smoothly fade-in / fade-out cyan glow as the current traverses
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const key = `${c},${r}`;
                const target = targetNodes.has(key) ? 1.0 : 0.0;
                let current = nodeIntensities.get(key) || 0.0;

                // Smoothly update actual intensity towards target value
                if (current < target) {
                    current += 0.08; // Smooth light up rate
                    if (current > target) current = target;
                } else if (current > target) {
                    current -= 0.04; // Smooth fade out rate
                    if (current < target) current = target;
                }
                nodeIntensities.set(key, current);

                // Draw base dim red ring
                ctx.beginPath();
                ctx.arc(getNodeX(c), getNodeY(r), NODE_R, 0, Math.PI * 2);
                ctx.strokeStyle = CIRCUIT_NODE;
                ctx.lineWidth = 1.0;
                ctx.stroke();

                // Draw glowing cyan overlay ring based on current intensity
                if (current > 0) {
                    ctx.beginPath();
                    ctx.arc(getNodeX(c), getNodeY(r), NODE_R, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(0, 229, 255, ${current * 0.85})`;
                    ctx.shadowColor = '#00E5FF';
                    ctx.shadowBlur = current * 8;
                    ctx.lineWidth = 1.0 + current * 0.6;
                    ctx.stroke();
                    ctx.shadowBlur = 0; // reset shadow glow
                }
            }
        }

        // 6. Draw the cyan traveling current segments on top
        for (const pulse of pulses) {
            const segments = pulse.getPathSegments();
            if (segments.length > 1) {
                ctx.beginPath();
                ctx.lineWidth = 2.0;
                ctx.lineCap = 'round';
                ctx.strokeStyle = CURRENT_COLOR;
                ctx.shadowColor = '#00E5FF';
                ctx.shadowBlur = 6;
                ctx.moveTo(segments[0].x, segments[0].y);
                for (let i = 1; i < segments.length; i++) {
                    ctx.lineTo(segments[i].x, segments[i].y);
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        requestAnimationFrame(animate);
    }

    animate();
});
