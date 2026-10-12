export const trainingText = {
  trainingSource: 'Training source',
  associateTrainingSource: 'Link training source',
  trainingSourceDatasets: 'Datasets used across this run',
  trainingSourceDatasetsHint:
    'These datasets were used across the run. Check Training data history for the configuration at a specific checkpoint.',
  trainingSourceHint:
    'Record the training run and exact dataset versions used to produce these weights.',
  trainingSourceEvidence: 'Evidence or notes',
  trainingSourceExisting: 'Use an existing training run',
  trainingSourceHistorical: 'Record past training',
  trainingSourceMode: 'Training record',
  trainingSourceRun: 'Completed training run',
  trainingSourceNoRuns:
    'No completed training runs. Choose “Record past training” to register one with its datasets.',
  trainingSourceAppendOnly:
    'The model version and weights stay unchanged. Once linked, this training source cannot be replaced.',
  trainingSourceHistoricalHint:
    'Records completed training without starting a job. Leave unknown times empty.',
  trainingStartedAt: 'Training started at',
  trainingEndedAt: 'Training ended at',
  invalidHistoricalTime: 'Enter a valid date and time.',
  trainingData: 'Training data history',
  trainingDataEmpty: 'No changes to the training data have been recorded.',
  recordTrainingData: 'Record data change',
  trainingDataStartStep: 'First step using these datasets',
  trainingDataConfiguration: 'All datasets used from this step',
  trainingDataHint:
    'Select the full dataset configuration, including datasets you keep. This records what the training code used; it does not change the running data loader.',
  trainingDataInitial: 'Initial configuration',
  trainingDataAdded: 'Added datasets',
  trainingDataRemoved: 'Removed datasets',
  trainingDataNote: 'Notes',
  continueTraining: 'Continue training with these weights',
  continueTrainingHint:
    'Create a new training run from this checkpoint. You can add datasets or change their configuration.',
  continueTrainingNoCode: 'A code version is required to continue from this checkpoint.',
} as const;

export const trainingTextTemplates = {
  continueTrainingName: (name: string, step: number) => `${name} (from step ${step})`,
  continueTrainingFromStep: (step: number) => `Continue from the checkpoint at step ${step}.`,
  trainingDataFromStep: (step: number) => `From step ${step}`,
};
