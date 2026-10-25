// docs/api-contract.mdに従った、ブラウザでの確認用のProject: 公開範囲付きの一覧、メンバー付きの作成、
// アーカイブ、アーカイブ済みを含む管理用の一覧、元に戻すことと完全削除、メンバーを選ぶ欄が使う
// 利用者の検索、filesystemのルートのパスに出すサーバーのディレクトリ。
import path from 'node:path';

// モックのAPIサーバーの作業ディレクトリ。相対のルートのパスは、APIと同じくここから解決する。
const SERVER_WORKING_DIRECTORY = '/srv/mmt';
const SERVER_DIRECTORIES = [
  '/data',
  '/data/.cache',
  '/data/datasets',
  '/srv',
  '/srv/mmt',
  '/srv/mmt/archive',
  '/srv/mmt/artifacts',
  '/srv/models',
  '/var',
  '/var/lib',
  '/var/lib/mmt',
  '/var/lib/mmt/artifacts',
];
const SERVER_FILES = ['/srv/mmt/README.md'];
// 候補に出すディレクトリの数のAPIの上限（DIRECTORY_SUGGESTION_LIMIT）。
const DIRECTORY_SUGGESTION_LIMIT = 50;
// ログイン中の利用者のほかに、メンバーを選ぶ欄で見つかる利用者。
const SEARCHABLE_USERS = [
  { id: '00000000-0000-4000-8000-00000000a001', email: 'aoki@example.invalid', displayName: '青木 研究員' },
  { id: '00000000-0000-4000-8000-00000000a002', email: 'ishii@example.invalid', displayName: '石井 研究員' },
  { id: '00000000-0000-4000-8000-00000000a003', email: 'ueda@example.invalid', displayName: '上田 研究員' },
];

function directoryStatus(resolvedPath) {
  if (SERVER_DIRECTORIES.includes(resolvedPath)) return 'directory';
  return SERVER_FILES.includes(resolvedPath) ? 'not_directory' : 'missing';
}

/** GET /admin/storage-directories?path=: `typed`を補完するディレクトリ。 */
export function suggestDirectories(typed) {
  const resolvedPath = path.posix.resolve(SERVER_WORKING_DIRECTORY, typed);
  const listsChildren = typed.endsWith('/');
  const parent = listsChildren ? resolvedPath : path.posix.dirname(resolvedPath);
  const namePrefix = listsChildren ? '' : path.posix.basename(resolvedPath);
  const matches = SERVER_DIRECTORIES.filter((directory) => {
    if (directory === parent || path.posix.dirname(directory) !== parent) return false;
    const name = path.posix.basename(directory);
    return name.startsWith(namePrefix) && (!name.startsWith('.') || namePrefix.startsWith('.'));
  }).sort();
  return {
    resolvedPath,
    status: directoryStatus(resolvedPath),
    items: matches.slice(0, DIRECTORY_SUGGESTION_LIMIT),
    truncated: matches.length > DIRECTORY_SUGGESTION_LIMIT,
  };
}

const toProject = ({
  archivedAt: _archivedAt,
  memberCount: _members,
  adminNames: _adminNames,
  runCount: _runs,
  ...project
}) => project;
const toAdminProject = ({ role: _role, isMember: _isMember, ...project }) => project;

/**
 * モックのAPIのProject。`mainProject`はほかのモックの経路が返すProjectで、同じオブジェクトのまま
 * 使うので、PATCHとほかの画面がお互いの変更を見られる。
 */
export function createProjectAdministration({ id, now, user, mainProject }) {
  const state = {
    projects: [
      Object.assign(mainProject, {
        archivedAt: null,
        memberCount: 1,
        adminNames: [user.displayName],
        runCount: 3,
      }),
    ],
    createRequests: [],
    // 次のアーカイブに409 project_has_active_jobsで答えるときに設定する。
    activeJobsBlockArchive: false,
  };
  const find = (projectId) => state.projects.find((project) => project.id === projectId);

  /** これらの経路の要求なら答え、そうでなければundefinedを返す。 */
  function handle({ path: requestPath, method, url, body, reply, list, fulfillEmpty }) {
    if (requestPath === '/projects' && method === 'GET')
      return list(state.projects.filter((project) => !project.archivedAt).map(toProject));
    if (requestPath === '/projects' && method === 'POST') {
      state.createRequests.push(body);
      if (!body.name?.trim()) return reply({ error: 'name is required', code: 'validation' }, 400);
      const project = {
        id: id(),
        name: body.name,
        description: body.description ?? '',
        artifactBackend: body.artifactBackend ?? 'filesystem',
        visibility: body.visibility ?? 'public',
        role: 'admin',
        isMember: true,
        createdAt: now,
        archivedAt: null,
        memberCount: 1 + (body.members?.length ?? 0),
        adminNames: [user.displayName],
        runCount: 0,
      };
      state.projects.push(project);
      return reply(toProject(project), 201);
    }
    if (requestPath === '/users' && method === 'GET') {
      const query = (url.searchParams.get('query') ?? '').toLowerCase();
      return list(
        [user, ...SEARCHABLE_USERS].filter(
          (candidate) =>
            query &&
            (candidate.displayName.toLowerCase().includes(query) ||
              candidate.email.toLowerCase().startsWith(query)),
        ),
      );
    }
    if (requestPath === '/admin/storage-directories' && method === 'GET')
      return reply(suggestDirectories(url.searchParams.get('path') ?? ''));
    if (requestPath === '/admin/projects' && method === 'GET') {
      const includeArchived = url.searchParams.get('includeArchived') === 'true';
      return list(
        state.projects
          .filter((project) => includeArchived || !project.archivedAt)
          .map(toAdminProject),
      );
    }
    const projectMatch = requestPath.match(/^\/projects\/([^/]+)(\/archive)?$/);
    // GET /projects/:p: アーカイブしたProjectは、開けない理由をメンバーに伝える。
    if (projectMatch && !projectMatch[2] && method === 'GET') {
      const project = find(projectMatch[1]);
      if (!project) return reply({ error: 'project not found', code: 'not_found' }, 404);
      if (project.archivedAt)
        return reply(
          {
            error:
              'このProjectはアーカイブされています。全体管理者が全体管理の「プロジェクト」から元に戻せます',
            code: 'project_archived',
          },
          404,
        );
      return reply(toProject(project));
    }
    if (projectMatch && find(projectMatch[1])) {
      const project = find(projectMatch[1]);
      if (!projectMatch[2] && method === 'PATCH') {
        Object.assign(project, body);
        return reply(toProject(project));
      }
      if (projectMatch[2] && method === 'POST') {
        if (state.activeJobsBlockArchive) {
          state.activeJobsBlockArchive = false;
          return reply({ error: 'Project has active jobs', code: 'project_has_active_jobs' }, 409);
        }
        project.archivedAt = now;
        return fulfillEmpty();
      }
    }
    const adminMatch = requestPath.match(/^\/admin\/projects\/([^/]+)(\/restore)?$/);
    if (adminMatch && find(adminMatch[1])) {
      const project = find(adminMatch[1]);
      if (adminMatch[2] && method === 'POST') {
        project.archivedAt = null;
        return reply(toAdminProject(project));
      }
      if (!adminMatch[2] && method === 'DELETE') {
        if (!project.archivedAt)
          return reply({ error: 'Archive the Project first', code: 'project_not_archived' }, 409);
        state.projects = state.projects.filter((candidate) => candidate !== project);
        return fulfillEmpty();
      }
    }
    return undefined;
  }

  return { state, handle };
}
