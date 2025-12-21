# One Move Left

A tile-matching puzzle game where players swipe to move tiles on a 6x6 grid, aiming to create chains of matching tiles that pop in neon chain reactions. The game features limited moves per level, with goals that must be completed before moves run out. Levels increase in difficulty as you progress.

## How to Play

### Objective
Complete the mission goal for each level before your moves run out. Missions vary and include popping a specific number of tiles, clearing certain colors, or reducing board density.

### Gameplay Mechanics

#### Board and Tiles
- The game is played on a 6x6 grid.
- Tiles come in 5 colors, each represented by a unique symbol:
  - Cyan: ◆
  - Purple: ✦
  - Green: ▲
  - Yellow: ●
  - Red: ✖

#### Moves
- Players make moves by swiping the board in one of four directions: left, right, up, or down.
- All tiles slide in the chosen direction until they hit the edge or another tile.
- Each level has a limited number of moves (displayed as "Moves left").

#### Matching and Popping
- After a move, the game checks for clusters of 3 or more adjacent tiles of the same color (horizontal or vertical adjacency).
- Matching clusters pop simultaneously, creating a "neon chain pop" effect.
- Popping can trigger additional matches in the same move, forming chains.
- Chains can continue up to 12 steps in a single move.
- Tiles fall into empty spaces after popping, potentially creating new matches.

#### Scoring
- Points are awarded for each tile popped.
- Base score: 10 points per tile.
- Bonus: Additional 5 points per tile beyond the minimum cluster size (3).
- Chain multiplier: Each chain step multiplies the score for that step.
- High scores are saved locally as "Best".

#### Goals (Missions)
Levels have specific goals that must be achieved:
- **Pop Total**: Pop a specific number of tiles in total.
- **Clear Color**: Eliminate a certain number of tiles of a specific color.
- **Clear Multi**: Clear multiple specific colors (e.g., 5 Cyan + 3 Purple).
- **Density Below**: Reduce the board to a certain percentage filled or less.

#### Level Progression
- Completing a goal advances to the next level.
- Levels increase in difficulty through:
  - Fewer moves allowed
  - More complex goals
  - Higher tile density
  - Larger board sizes (potentially, though current is 6x6)

#### Losing
- If moves reach 0 without completing the goal, the level fails.
- Players can retry the level or start over.

#### Winning
- Successfully complete the goal before moves run out.
- Progress to the next level automatically.

## Controls
- **Swipe**: Drag in any direction to move tiles.
- **Start/Next**: Begin a new level or proceed to the next.
- **Retry**: Restart the current level.
- **Sound**: Toggle sound effects on/off.

## Tips
- One swipe can trigger multiple pops through chains.
- Look for setups that create long chains for higher scores.
- Plan moves to clear required colors or meet density goals.
- Chain reactions can help achieve goals more efficiently.

## Features
- Responsive design for mobile and desktop
- Local storage for best score and sound preferences
- Accessibility features with ARIA labels and keyboard navigation
- Neon-themed visual effects
- Progressive difficulty levels

## Setup and Installation

1. Clone or download the repository
2. Open `index.html` in a web browser
3. Start playing!

## Technical Details
- Built with vanilla JavaScript, HTML, and CSS
- No external frameworks or libraries required
- Uses local storage for game state persistence
- Includes Cloudflare Web Analytics tracking

## Accessibility
- The game includes ARIA labels for screen readers.
- Keyboard navigation is supported.
- Sound effects can be toggled.