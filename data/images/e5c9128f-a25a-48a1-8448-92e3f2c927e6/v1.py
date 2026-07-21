import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches

fig, ax = plt.subplots(figsize=(6, 5))
fig.patch.set_facecolor('white')
ax.set_facecolor('white')

# Draw triangle
triangle = patches.Polygon([[0, 0], [4, 0], [0, 3]], closed=True, edgecolor='#1a1a1a', facecolor='#eaf2fb', linewidth=2)
ax.add_patch(triangle)

# Draw right angle marker
right_angle = patches.Polygon([[0, 0.3], [0.3, 0.3], [0.3, 0]], closed=False, edgecolor='#1a1a1a', facecolor='none', linewidth=1.5)
ax.add_patch(right_angle)

# Labels
ax.text(-0.25, 1.5, "3", fontsize=12, ha="right", va="center", color="#1a1a1a")
ax.text(2.0, -0.25, "4", fontsize=12, ha="center", va="top", color="#1a1a1a")
ax.text(2.1, 1.6, "5", fontsize=12, ha="left", va="bottom", color="#1a1a1a")

# Set limits and aspect
ax.set_xlim(-1, 5)
ax.set_ylim(-1, 4)
ax.set_aspect('equal')
ax.axis('off')

plt.savefig("out.png", dpi=150, bbox_inches='tight')