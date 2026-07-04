import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# Create the figure and axis
fig, ax = plt.subplots(figsize=(6, 6))

# Set limits to center around the intersection point (4, -1)
ax.set_xlim(-2, 10)
ax.set_ylim(-7, 5)

# Draw grid and axes
ax.grid(True, linestyle='--', alpha=0.6)
ax.axhline(0, color='#1a1a1a', linewidth=1.2)
ax.axvline(0, color='#1a1a1a', linewidth=1.2)

# Define two lines that intersect at (4, -1)
# Line 1: y = x - 5
# Line 2: y = -0.5x + 1
x_vals = np.linspace(-2, 10, 100)
y1 = x_vals - 5
y2 = -0.5 * x_vals + 1

# Plot the lines
ax.plot(x_vals, y1, color='#1a1a1a', linewidth=1.5)
ax.plot(x_vals, y2, color='#1a1a1a', linewidth=1.5)

# Plot the intersection point
ax.plot(4, -1, 'o', color='#1a1a1a', markersize=6)
ax.text(4.3, -0.8, '(4, -1)', fontsize=12, fontweight='bold', color='#1a1a1a')

# Label axes
ax.set_xlabel('x', loc='right', fontsize=12)
ax.set_ylabel('y', loc='top', rotation=0, fontsize=12)

# Clean up the plot appearance
ax.set_aspect('equal')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_position('zero')
ax.spines['bottom'].set_position('zero')

# Save the figure
plt.tight_layout()
plt.savefig("out.png", dpi=150)