# Por Donde Pasa - SITP

Transit app for SITP (Sistema Integrado de Transporte Público de Bogotá).

## GitHub Pages Deployment

This repository includes a GitHub Actions workflow that automatically builds and deploys the `gtfs-app` web application to GitHub Pages.

### Enabling GitHub Pages

To enable the deployment, configure the repository settings:

1. Go to **Settings** → **Pages** in your GitHub repository
2. Under **Build and deployment**:
   - Set **Source** to: `GitHub Actions`
3. The workflow will automatically deploy when changes are pushed to the `main` branch

### Manual Deployment

You can also trigger a deployment manually:

1. Go to **Actions** tab in the repository
2. Select **Deploy to GitHub Pages** workflow
3. Click **Run workflow** button

### Accessing the Deployed Site

Once deployed, the site will be available at:
```
https://juanfonsecaLS1.github.io/pordondepasa-sitp/
```

## Local Development

To run the gtfs-app locally:

```bash
cd gtfs-app
npm install
npm run dev
```

To build for production:

```bash
cd gtfs-app
npm run build
```

The production build will be output to `gtfs-app/dist/`.

## Project Structure

- `gtfs-app/` - React + TypeScript + Vite web application
- `pre-processing/` - Data preprocessing scripts
- `.github/workflows/` - GitHub Actions workflows for CI/CD
