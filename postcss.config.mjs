/**
 * PostCSS configuration for Tailwind CSS (per Constitution v2.3.0 —
 * Technical Stack Constraints, "Styling" line). Used by Next.js's
 * PostCSS pipeline to compile Tailwind utility classes from JSX
 * `className` into the final stylesheet.
 *
 * @see specs/001-teachers/tasks.md T012a
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
