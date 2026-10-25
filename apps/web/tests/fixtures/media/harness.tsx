// tests/browser-media.mjsのために、Runのメディアのコンポーネントだけを描く。Viteの開発サーバーが
// /tests/fixtures/media/harness.htmlで配信する。これらを載せるページ（RunDetailPageのメディアの
// タブ、ComparePageのメディアのタブ）はchart-panels-and-pages-webの担当。
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

// コンポーネントはRunとCompareのページと同じく、選んだキーとstepをURLに持つ（hooks/useMediaLocation）。
// そのためrouterが要る。コンポーネントはそれらをharnessのパラメータの横に足す。
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
