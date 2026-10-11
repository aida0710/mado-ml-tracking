// Renders the Run media components alone for tests/browser-media.mjs, served by the Vite dev
// server at /tests/fixtures/media/harness.html. The pages that host them (RunDetailPage's media
// tab, ComparePage's media tab) belong to chart-panels-and-pages-web.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '../../../src/styles/base.css';
import '../../../src/styles/layout.css';
import '../../../src/styles/tables.css';
import '../../../src/styles/artifacts.css';
import '../../../src/styles/audio.css';
import '../../../src/styles/forms.css';
import '../../../src/styles/media.css';
import { MediaCompare } from '../../../src/components/media/MediaCompare';
import { RunMediaPanel } from '../../../src/components/media/RunMediaPanel';

const parameters = new URLSearchParams(window.location.search);
const projectId = parameters.get('projectId') ?? '';
document.documentElement.dataset.theme = parameters.get('theme') === 'dark' ? 'dark' : 'light';

// The components keep the chosen key and steps in the URL (hooks/useMediaLocation), as on the
// Run and Compare pages, so they need a router; it adds them next to the harness parameters.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <main className="page" style={{ padding: 24 }}>
        {parameters.get('view') === 'compare' ? (
          <MediaCompare projectId={projectId} runIds={(parameters.get('runIds') ?? '').split(',')} />
        ) : (
          <RunMediaPanel projectId={projectId} runId={parameters.get('runId') ?? ''} />
        )}
      </main>
    </BrowserRouter>
  </StrictMode>,
);
