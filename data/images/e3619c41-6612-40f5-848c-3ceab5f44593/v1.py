import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches

fig, ax = plt.subplots(figsize=(5, 4))

# Triangle vertices
A = [0, 0]
B = [4, 0]
C = [0, 3]

# Draw triangle fill and border
triangle = patches.Polygon([A, B, C], closed=True, facecolor='#eaf2fb', edgecolor='#1a1a1a', linewidth=2)
ax.add_patch(triangle)

# Right angle marker (square at origin)
rect = patches.Rectangle((0, 0), 0.3, 0.3, fill=False, edgecolor='#1a1a1a', linewidth=1.5)
ax.add_patch(rect)

# Labels for the sides
ax.text(-0.2, 1.5, "3 cm", ha="right", va="center", fontsize=12, color="#1a1a1a")
ax.text(2, -0.3, "4 cm", ha="center", va="top", fontsize=12, color="#1a1a1a")
ax.text(2.24, 1.82, "5 cm", ha="left", va="bottom", fontsize=12, color="#1a1a1a")

# Set limits and aspect ratio
ax.set_xlim(-0.8, 4.8)
ax.set_ylim(-0.8, 3.8)
ax.set_aspect('equal')
ax.axis('off')

plt.savefig("out.png", dpi=150, bbox_inches='tight')