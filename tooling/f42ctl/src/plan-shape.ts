import {
  deployPlanSchema,
  deploymentManifestSchema,
  type DeployPlan,
} from '@fellowship42/management-protocol'

export function buildDeployPlanWithDigest(
  input: unknown,
  manifestSha256: string,
): DeployPlan {
  const manifest = deploymentManifestSchema.parse(input)
  const step = (
    id: string,
    kind: DeployPlan['steps'][number]['kind'],
    resourceName: string | null,
    dependsOn: string[],
  ) => ({ id, kind, resourceName, dependsOn, destructive: false as const })

  return deployPlanSchema.parse({
    formatVersion: 1,
    manifestSha256,
    instanceId: manifest.instance.id,
    environment: manifest.target.environment,
    steps: [
      step('step-01', 'verify-release', null, []),
      step('step-02', 'ensure-d1', manifest.resources.d1.name, ['step-01']),
      step('step-03', 'ensure-r2', manifest.resources.r2.name, ['step-01']),
      step(
        'step-04',
        'ensure-outbox-queue',
        manifest.resources.outboxQueue.name,
        ['step-01'],
      ),
      step(
        'step-05',
        'ensure-dead-letter-queue',
        manifest.resources.outboxQueue.deadLetterName,
        ['step-01'],
      ),
      step('step-06', 'configure-worker', manifest.worker.name, [
        'step-02',
        'step-03',
        'step-04',
        'step-05',
      ]),
      step('step-07', 'apply-migrations', manifest.resources.d1.name, [
        'step-02',
        'step-06',
      ]),
      step('step-08', 'deploy-worker', manifest.worker.name, [
        'step-03',
        'step-04',
        'step-05',
        'step-06',
        'step-07',
      ]),
      step('step-09', 'configure-domains', manifest.worker.name, ['step-08']),
      step('step-10', 'configure-access', manifest.worker.name, ['step-09']),
      step('step-11', 'verify-runtime', manifest.worker.name, ['step-10']),
    ],
  })
}
