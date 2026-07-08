import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Create figure and axis
fig, ax = plt.subplots(figsize=(5, 4))

# Define vertices
A = (1, 4)
B = (1, 1)
C = (5, 1)

# Draw the triangle
ax.plot([A[0], B[0], C[0], A[0]], [A[1], B[1], C[1], A[1]], color='#1a1a1a', lw=2)

# Draw the right-angle mark at B
ax.plot([1, 1.3, 1.3], [1.3, 1.3, 1], color='#1a1a1a', lw=1.5)

# Label the vertices
ax.text(0.8, 4.1, 'A', fontsize=12, ha='right', va='bottom', color='#1a1a1a')
ax.text(0.8, 0.8, 'B', fontsize=12, ha='right', va='top', color='#1a1a1a')
ax.text(5.2, 0.8, 'C', fontsize=12, ha='left', va='top', color='#1a1a1a')

# Label the hypotenuse (10 cm)
# Midpoint of AC is (3, 2.5). We offset perpendicular to the hypotenuse.
# Hypotenuse angle is approx -36.87 degrees.
ax.text(3.15, 2.7, '10 cm', fontsize=12, ha='center', va='bottom', rotation=-36.87, color='#1a1a1a')

# Set limits and aspect ratio
ax.set_xlim(0.2, 5.8)
ax.set_ylim(0.2, 4.8)
ax.set_aspect('equal')

# Turn off axis
ax.axis('off')

# Save the image
plt.savefig("out.png", dpi=150, bbox_inches='tight')