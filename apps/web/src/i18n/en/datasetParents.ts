export const datasetParentsText = {
  addParents: 'Add parent versions',
  parentHistory: 'Parent addition history',
  parentHistoryHint: 'Historical provenance corrections, separate from changes to training data.',
  parentHistoryEmpty: 'No parent versions have been added after registration.',
  parentVersion: 'Parent dataset version',
  selectedParents: 'Verified parent dataset versions',
  reason: 'Reason for adding these parents',
  evidence: 'Comparison evidence (JSON)',
  evidenceColumn: 'Evidence',
  createdBy: 'Added by',
  createdAt: 'Added at',
  addParentsHint:
    'Add verified sources while keeping this version and existing training references. Recorded parents and evidence cannot be replaced.',
  parentCycle: 'Adding these parents would create a cycle in the data lineage.',
} as const;
