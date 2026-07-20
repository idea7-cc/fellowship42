import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  INSTANCE_TOPOLOGY,
  MANAGEMENT_PROTOCOL_VERSION,
  instanceDescriptorSchema,
  instanceHealthObservationSchema,
  managementCommandSchema,
  deploymentManifestSchema,
  doctorCheckIdSchema,
  doctorReportSchema,
  exportEvidenceSchema,
  portableConfigurationSchema,
  portableExportManifestSchema,
  r2ExportIndexSchema,
  cutoverApprovalSchema,
  importPlanSchema,
  migrationRehearsalEvidenceSchema,
  managementAdapterConformanceReportSchema,
  assessReleaseUpgradeEligibility,
  compareSemanticVersions,
  releaseManifestSchema,
  releaseUpgradeMetadataSchema,
  instanceRuntimeHealthSchema,
  portableRestoreConformanceReportSchema,
  exitHandoffSchema,
  managementExitDispositionSchema,
  updateApplyAuthorizationSchema,
  updatePreparationSchema,
  partnerCompatibilityProfileSchema,
  partnerCompatibilityProfile,
  operatorReferenceDefinitionsSchema,
  operatorReferenceCatalogSchema,
} from './index'

const deploymentManifest = {
  formatVersion: 1,
  instance: {
    id: 'instance_42424242-1234-5678-9abc-123456789abc',
    topology: 'single-church',
    release: {
      tag: 'v0.6.0',
      applicationVersion: '0.6.0',
      schemaVersion: 5,
      managementProtocolPackageVersion: '0.2.0',
      managementProtocolWireVersion: '1',
      sourceCommit: '4ec2f8b34b4a6b2938b0f3d1d6924daab4587ae1',
      manifestUrl:
        'https://github.com/idea7-cc/fellowship42/releases/download/v0.6.0/release-manifest.json',
      manifestSha256:
        '3609a466938e4df3980eb2600087f774a817afd5f2bf008e07042e40ae3aebb2',
    },
  },
  custody: { infrastructureOwner: 'church', operator: 'church' },
  target: { environment: 'local', accountAlias: 'local-development' },
  worker: { name: 'fellowship42', domains: [] },
  resources: {
    d1: { binding: 'DB', name: 'fellowship42' },
    r2: { binding: 'MEDIA', name: 'fellowship42-media' },
    outboxQueue: {
      binding: 'OUTBOX_QUEUE',
      name: 'fellowship42-outbox',
      deadLetterName: 'fellowship42-outbox-dlq',
    },
    durableObject: { binding: 'CHURCH_ROOMS', className: 'ChurchRoom' },
    schedules: ['*/1 * * * *'],
  },
  configuration: {
    accessTeamDomain: null,
    accessAudienceConfigured: false,
    paymentWebhookProvider: null,
  },
} as const

describe('management protocol contracts', () => {
  it('publishes bounded operator references pinned to one exact release', async () => {
    const definitions = operatorReferenceDefinitionsSchema.parse(
      JSON.parse(
        await readFile(
          new URL('../../../docs/operator-reference-definitions.json', import.meta.url),
          'utf8',
        ),
      ),
    )
    const repository = 'https://github.com/idea7-cc/fellowship42' as const
    const commit = 'a'.repeat(40)
    const catalog = operatorReferenceCatalogSchema.parse({
      formatVersion: 1,
      applicationVersion: '0.25.0',
      releaseTag: 'v0.25.0',
      source: { repository, commit },
      references: [
        {
          id: 'release-manifest',
          kind: 'release',
          title: 'Verify the release manifest',
          summary: 'Verify the exact checksummed release manifest and its artifacts.',
          audiences: ['service-operator'],
          immutableUrl: `${repository}/releases/download/v0.25.0/release-manifest.json`,
          sourcePath: null,
        },
        {
          id: 'release-page',
          kind: 'release',
          title: 'Review the release page',
          summary: 'Review the exact tagged release and its published release notes.',
          audiences: ['service-operator'],
          immutableUrl: `${repository}/releases/tag/v0.25.0`,
          sourcePath: null,
        },
        ...definitions.references.map((reference) => ({
          ...reference,
          immutableUrl: `${repository}/blob/${commit}/${reference.sourcePath}`,
        })),
      ],
    })

    expect(catalog.references).toHaveLength(definitions.references.length + 2)
    expect(catalog.references.every((reference) =>
      reference.immutableUrl.includes(commit) ||
      reference.immutableUrl.includes('/v0.25.0'),
    )).toBe(true)
    expect(operatorReferenceCatalogSchema.safeParse({
      ...catalog,
      references: catalog.references.map((reference) =>
        reference.id === 'operator-recovery'
          ? { ...reference, immutableUrl: `${repository}/blob/main/docs/operator-recovery.md` }
          : reference),
    }).success).toBe(false)
  })

  it('accepts only the ordered payload-free partner compatibility inputs', async () => {
    const profile = JSON.parse(
      await readFile(
        new URL(
          '../fixtures/partner-compatibility-profile.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(partnerCompatibilityProfileSchema.parse(profile)).toEqual(profile)
    expect(profile).toEqual(partnerCompatibilityProfile)
    expect(partnerCompatibilityProfileSchema.safeParse({
      ...profile,
      inputs: [...profile.inputs].reverse(),
    }).success).toBe(false)
    expect(partnerCompatibilityProfileSchema.safeParse({
      ...profile,
      inputs: profile.inputs.map((input: Record<string, unknown>, index: number) =>
        index === 0 ? { ...input, requiresProviderCredential: true } : input),
    }).success).toBe(false)
  })

  it('requires complete local revocation and ordered hosted-exit handoff evidence', () => {
    const disposition = {
      formatVersion: 1,
      instanceId: deploymentManifest.instance.id,
      state: 'disconnected',
      connectionId: '42424242-1234-4678-9abc-123456789a91',
      operatorId: 'operator_test',
      disconnectedAt: '2026-07-19T22:29:00.000Z',
      observedAt: '2026-07-19T22:31:00.000Z',
      auditEventId:
        'management-disconnect:42424242-1234-4678-9abc-123456789a91',
      checks: {
        activeConnectionAbsent: true,
        activeGrantsRevoked: true,
        localKeyMaterialRemoved: true,
        replayStateRemoved: true,
        commandStateRemoved: true,
        churchOperationsAvailable: true,
      },
    }
    expect(managementExitDispositionSchema.parse(disposition)).toEqual(
      disposition,
    )
    expect(
      managementExitDispositionSchema.safeParse({
        ...disposition,
        checks: { ...disposition.checks, localKeyMaterialRemoved: false },
      }).success,
    ).toBe(false)

    const handoff = {
      formatVersion: 1,
      operationId: '42424242-1234-4678-9abc-123456789abc',
      instanceId: deploymentManifest.instance.id,
      destinationCustody: {
        infrastructureOwner: 'church',
        infrastructureOwnerSubject: 'organization:new-example-church',
        operatorSubject: 'user:church-admin',
      },
      resources: [
        'd1-database',
        'r2-bucket',
        'worker',
        'outbox-queue',
        'dead-letter-queue',
        'durable-object-namespace',
        'access-policy',
        'domains',
      ].map((kind) => ({
        kind,
        destinationState: 'verified',
        sourceDisposition:
          kind === 'domains' ? 'routing-retired' : 'access-revoked',
      })),
      domains: [{
        hostname: 'new.example.org',
        destinationRouting: 'active',
        sourceRouting: 'retired',
      }],
      operators: [{
        subject: 'organization:new-example-church',
        role: 'infrastructure-owner',
        disposition: 'church-controlled',
      }],
      credentialAttestation: {
        deployment: 'rotated',
        applicationSecrets: 'rotated',
        management: 'disconnected',
        attestedAt: '2026-07-19T22:31:00.000Z',
      },
      independentOperationVerifiedAt: '2026-07-19T22:31:00.000Z',
      sourceRoutingRetiredAt: '2026-07-19T22:31:00.000Z',
      supportExpiresAt: '2026-08-19T22:31:00.000Z',
      unresolvedRisks: [],
    }
    expect(exitHandoffSchema.parse(handoff)).toEqual(handoff)
    expect(
      exitHandoffSchema.safeParse({
        ...handoff,
        resources: [...handoff.resources].reverse(),
      }).success,
    ).toBe(false)
  })

  it('requires every portable restore conformance scenario in order', () => {
    const report = {
      formatVersion: 1,
      profile: 'f42-portable-restore-v1',
      release: {
        applicationVersion: '0.17.0',
        schemaVersion: 6,
        managementProtocolPackageVersion: '1.5.0',
        lifecycleCliVersion: '0.8.0',
        exportFormatVersion: 1,
        importFormatVersion: 1,
      },
      scenarios: [
        'export-integrity-verified',
        'tampered-export-rejected',
        'new-empty-destination-required',
        'd1-and-r2-restored',
        'credentials-rotated',
        'portable-identity-preserved',
        'runtime-healthy-before-cutover',
        'cutover-and-source-untouched',
        'partial-restore-fails-closed',
      ].map((id) => ({ id, status: 'passed' })),
    }
    expect(portableRestoreConformanceReportSchema.parse(report)).toEqual(
      report,
    )
    expect(
      portableRestoreConformanceReportSchema.safeParse({
        ...report,
        scenarios: [...report.scenarios].reverse(),
      }).success,
    ).toBe(false)
  })

  it('accepts the immutable portable restore conformance fixture', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL(
          '../fixtures/portable-restore-conformance.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(portableRestoreConformanceReportSchema.parse(fixture)).toEqual(
      fixture,
    )
  })

  it('accepts privacy-bounded pre-owner runtime evidence', () => {
    const health = instanceRuntimeHealthSchema.parse({
      status: 'ok',
      service: 'fellowship42-instance',
      topology: 'single-church',
      storage: 'd1',
      outbox: 'clear',
      paymentWebhooks: 'unconfigured',
      bootstrap: {
        state: 'awaiting-owner',
        portableIdentitySha256: 'a'.repeat(64),
      },
    })

    expect(health.bootstrap.state).toBe('awaiting-owner')
    expect(JSON.stringify(health)).not.toContain('email')
    expect(
      instanceRuntimeHealthSchema.safeParse({
        ...health,
        status: 'ok',
        bootstrap: {
          state: 'identity-mismatch',
          portableIdentitySha256: 'a'.repeat(64),
        },
      }).success,
    ).toBe(false)
  })

  it('describes a church-owned instance operated by a partner', () => {
    const result = instanceDescriptorSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      instanceId: 'instance_demo',
      topology: INSTANCE_TOPOLOGY,
      applicationVersion: '0.1.0',
      schemaVersion: 2,
      infrastructure: { owner: 'church', operator: 'partner' },
      capabilities: ['instance.status.read', 'backup.export'],
    })

    expect(result.infrastructure).toEqual({
      owner: 'church',
      operator: 'partner',
    })
  })

  it('publishes a strict privacy-bounded fleet health observation', () => {
    const observation = {
      formatVersion: 1,
      portableInstanceId: deploymentManifest.instance.id,
      observedAt: '2026-07-20T12:00:00-04:00',
      source: 'management-sync',
      overallStatus: 'healthy',
      release: {
        applicationVersion: '0.19.0',
        schemaVersion: 6,
        managementProtocolWireVersion: '1',
      },
      connection: { status: 'connected', grantVersion: 2 },
      checks: {
        database: 'ready',
        objectStorage: 'ready',
        authentication: 'ready',
        migrations: 'current',
        realtime: 'unknown',
        paymentWebhooks: 'unconfigured',
        outbox: 'clear',
      },
      traffic: {
        availability: 'unknown',
        errorRate: 'unknown',
        latency: 'unknown',
        window: 'unknown',
      },
    } as const

    expect(instanceHealthObservationSchema.parse(observation)).toEqual({
      ...observation,
      observedAt: '2026-07-20T16:00:00.000Z',
    })
    expect(
      instanceHealthObservationSchema.safeParse({
        ...observation,
        memberCount: 42,
      }).success,
    ).toBe(false)
    expect(
      instanceHealthObservationSchema.safeParse({
        ...observation,
        connection: { status: 'connected', grantVersion: null },
      }).success,
    ).toBe(false)
    expect(
      instanceHealthObservationSchema.safeParse({
        ...observation,
        checks: { ...observation.checks, database: 'unavailable' },
      }).success,
    ).toBe(false)
  })

  it('rejects commands without replay-protection metadata', () => {
    const result = managementCommandSchema.safeParse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: crypto.randomUUID(),
      instanceId: 'instance_demo',
      capability: 'update.apply',
    })

    expect(result.success).toBe(false)
  })

  it('accepts a bounded, replay-protected command envelope', () => {
    const command = managementCommandSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: crypto.randomUUID(),
      instanceId: 'instance_demo',
      issuedAt: '2026-07-18T16:00:00.000Z',
      expiresAt: '2026-07-18T16:05:00.000Z',
      nonce: '0123456789abcdefghijkl',
      type: 'instance.status.read',
      capability: 'instance.status.read',
      input: {},
    })

    expect(command.input).toEqual({})
  })

  it('accepts the immutable v0.1.0 release-manifest fixture', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL('../fixtures/release-manifest.v1.json', import.meta.url),
        'utf8',
      ),
    )

    const manifest = releaseManifestSchema.parse(fixture)

    expect(manifest.source.commit).toBe(
      '1d2ad29942a4a72c00ab982ce621f9573aba5560',
    )
    expect(manifest.artifacts).toHaveLength(2)
    expect(manifest.upgrade).toBeUndefined()
  })

  it('publishes exact-source upgrade eligibility without weakening old manifests', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL('../fixtures/release-manifest.v1.json', import.meta.url),
        'utf8',
      ),
    )
    const upgrade = releaseUpgradeMetadataSchema.parse(
      JSON.parse(
        await readFile(
          new URL('../../../release-upgrade-policy.json', import.meta.url),
          'utf8',
        ),
      ),
    )
    const target = releaseManifestSchema.parse({
      ...fixture,
      application: {
        ...fixture.application,
        version: upgrade.target.applicationVersion,
        schemaVersion: upgrade.target.schemaVersion,
      },
      managementProtocol: {
        ...fixture.managementProtocol,
        wireVersion: upgrade.target.managementProtocolWireVersion,
      },
      upgrade,
    })
    const source = upgrade.eligibleSources[0]

    expect(assessReleaseUpgradeEligibility(target, source)).toEqual({
      eligible: true,
      code: 'eligible',
      requiredEvidence: upgrade.requiredEvidence,
    })
    expect(
      assessReleaseUpgradeEligibility(target, {
        ...source,
        releaseManifestSha256: '0'.repeat(64),
      }),
    ).toEqual({
      eligible: false,
      code: 'source-not-eligible',
      requiredEvidence: [],
    })
    expect(
      releaseManifestSchema.safeParse({
        ...target,
        upgrade: {
          ...upgrade,
          target: {
            ...upgrade.target,
            schemaVersion: upgrade.target.schemaVersion + 1,
          },
        },
      }).success,
    ).toBe(false)
    expect(
      assessReleaseUpgradeEligibility(
        releaseManifestSchema.parse(fixture),
        source,
      ),
    ).toEqual({
      eligible: false,
      code: 'upgrade-metadata-missing',
      requiredEvidence: [],
    })
  })

  it('rejects ambiguous upgrade metadata', () => {
    const source = {
      releaseTag: 'v0.19.0',
      releaseManifestSha256: '1'.repeat(64),
      applicationVersion: '0.19.0',
      schemaVersion: 6,
      managementProtocolWireVersion: '1',
    }
    expect(
      releaseUpgradeMetadataSchema.safeParse({
        formatVersion: 1,
        strategy: 'in-place-expand-contract',
        rollbackPolicy: 'roll-forward-after-migration',
        target: {
          applicationVersion: '0.20.0',
          schemaVersion: 6,
          managementProtocolWireVersion: '1',
        },
        eligibleSources: [source, source],
        requiredEvidence: ['doctor-pass', 'doctor-pass'],
      }).success,
    ).toBe(false)
    expect(
      releaseUpgradeMetadataSchema.safeParse({
        formatVersion: 1,
        strategy: 'in-place-expand-contract',
        rollbackPolicy: 'roll-forward-after-migration',
        target: {
          applicationVersion: source.applicationVersion,
          schemaVersion: source.schemaVersion,
          managementProtocolWireVersion: '1',
        },
        eligibleSources: [source],
        requiredEvidence: ['explicit-approval'],
      }).success,
    ).toBe(false)
    expect(compareSemanticVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0)
    expect(compareSemanticVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBeLessThan(0)
  })

  it('binds update preparation, local approval, and deployment authorization evidence', () => {
    const source = {
      releaseTag: 'v0.21.0',
      releaseManifestSha256: '1'.repeat(64),
      applicationVersion: '0.21.0',
      schemaVersion: 7,
      managementProtocolWireVersion: '1',
    }
    const target = {
      releaseTag: 'v0.22.0',
      releaseManifestSha256: '2'.repeat(64),
      applicationVersion: '0.22.0',
      schemaVersion: 7,
      managementProtocolWireVersion: '1',
    }
    const prepared = updatePreparationSchema.parse({
      formatVersion: 1,
      preparationId: '11111111-1111-4111-8111-111111111111',
      instanceId: deploymentManifest.instance.id,
      source,
      target,
      requiredEvidence: [
        'release-artifacts-verified',
        'doctor-pass',
        'portable-export-verified',
        'explicit-approval',
      ],
      state: 'approved',
      preparedAt: '2026-07-20T04:00:00.000Z',
      expiresAt: '2026-07-20T05:00:00.000Z',
      localApproval: {
        localApprovalId: '22222222-2222-4222-8222-222222222222',
        approvedAt: '2026-07-20T04:10:00.000Z',
        expiresAt: '2026-07-20T04:40:00.000Z',
        consumedAt: null,
      },
      authorization: null,
      appliedAt: null,
    })
    expect(prepared.target).toEqual(target)

    const authorization = updateApplyAuthorizationSchema.parse({
      formatVersion: 1,
      authorizationId: '33333333-3333-4333-8333-333333333333',
      preparationId: prepared.preparationId,
      localApprovalId: prepared.localApproval?.localApprovalId,
      instanceId: prepared.instanceId,
      source,
      target,
      strategy: 'in-place-expand-contract',
      rollbackPolicy: 'roll-forward-after-migration',
      authorizedAt: '2026-07-20T04:20:00.000Z',
      expiresAt: '2026-07-20T05:20:00.000Z',
    })
    expect(authorization.target.releaseManifestSha256).toBe('2'.repeat(64))
    expect(
      updateApplyAuthorizationSchema.safeParse({
        ...authorization,
        target: { ...target, releaseTag: 'v0.22.1' },
      }).success,
    ).toBe(false)
    expect(
      updatePreparationSchema.safeParse({
        ...prepared,
        state: 'authorized',
      }).success,
    ).toBe(false)
  })

  it('accepts the immutable hosted-to-church-owned rehearsal fixture', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL(
          '../fixtures/migration-rehearsal.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    const evidence = migrationRehearsalEvidenceSchema.parse(fixture)

    expect(evidence.status).toBe('verified')
    expect(evidence.assertions).toHaveLength(10)
    expect(JSON.stringify(evidence)).not.toContain('rehearsal.example.org')
    expect(
      migrationRehearsalEvidenceSchema.safeParse({
        ...evidence,
        assertions: [...evidence.assertions].reverse(),
      }).success,
    ).toBe(false)
    expect(
      migrationRehearsalEvidenceSchema.safeParse({
        ...evidence,
        cloudflareAccountId: 'forbidden-provider-id',
      }).success,
    ).toBe(false)
  })

  it('accepts only the ordered passing management-adapter conformance fixture', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL(
          '../fixtures/management-adapter-conformance.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    const report = managementAdapterConformanceReportSchema.parse(fixture)

    expect(report.instance.applicationVersion).toBe('0.17.0')
    expect(report.scenarios).toHaveLength(6)
    expect(
      managementAdapterConformanceReportSchema.safeParse({
        ...report,
        scenarios: [...report.scenarios].reverse(),
      }).success,
    ).toBe(false)
    expect(
      managementAdapterConformanceReportSchema.safeParse({
        ...report,
        scenarios: report.scenarios.map((scenario, index) =>
          index === 0 ? { ...scenario, status: 'failed' } : scenario,
        ),
      }).success,
    ).toBe(false)
  })

  it('rejects a release manifest with a malformed checksum', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL('../fixtures/release-manifest.v1.json', import.meta.url),
        'utf8',
      ),
    )
    fixture.artifacts[0].sha256 = 'not-a-checksum'

    expect(releaseManifestSchema.safeParse(fixture).success).toBe(false)
  })

  it('accepts a portable deployment manifest without provider identifiers', () => {
    const parsed = deploymentManifestSchema.parse(deploymentManifest)

    expect(parsed.instance.release.sourceCommit).toHaveLength(40)
    expect(JSON.stringify(parsed)).not.toContain('accountId')
  })

  it('requires production identity configuration and exact release coordinates', () => {
    const production = {
      ...deploymentManifest,
      target: { ...deploymentManifest.target, environment: 'production' },
    }
    const wrongCommit = {
      ...deploymentManifest,
      instance: {
        ...deploymentManifest.instance,
        release: {
          ...deploymentManifest.instance.release,
          sourceCommit: 'main',
        },
      },
    }

    expect(deploymentManifestSchema.safeParse(production).success).toBe(false)
    expect(deploymentManifestSchema.safeParse(wrongCommit).success).toBe(false)
  })

  it('derives doctor health from bounded check statuses', () => {
    const report = {
      formatVersion: 1,
      checkedAt: '2026-07-19T19:30:00.000Z',
      manifestSha256: deploymentManifest.instance.release.manifestSha256,
      instanceId: deploymentManifest.instance.id,
      release: deploymentManifest.instance.release,
      status: 'healthy',
      checks: doctorCheckIdSchema.options.map((id) => ({
        id,
        status: 'pass',
        code: `${id}-verified`,
      })),
    }

    expect(doctorReportSchema.parse(report).status).toBe('healthy')
    expect(
      doctorReportSchema.safeParse({
        ...report,
        checks: report.checks.slice(0, -1),
      }).success,
    ).toBe(false)
    expect(
      doctorReportSchema.safeParse({
        ...report,
        status: 'healthy',
        checks: report.checks.map((check) =>
          check.id === 'release-manifest'
            ? { ...check, status: 'fail', code: 'digest-mismatch' }
            : check,
        ),
      }).success,
    ).toBe(false)
  })

  it('binds a portable export to identity, release, quiescence, and fixed artifacts', () => {
    const exported = portableExportManifestSchema.parse({
      formatVersion: 1,
      instanceId: deploymentManifest.instance.id,
      sourceRelease: deploymentManifest.instance.release,
      exportedAt: '2026-07-19T21:01:00.000Z',
      consistency: {
        mode: 'operator-quiesced',
        quiescedAt: '2026-07-19T21:00:00.000Z',
      },
      artifacts: [
        { kind: 'd1-sql', file: 'd1/database.sql', bytes: 42, sha256: 'a'.repeat(64) },
        {
          kind: 'portable-configuration',
          file: 'config/portable.json',
          bytes: 42,
          sha256: 'b'.repeat(64),
        },
        { kind: 'r2-index', file: 'r2/index.json', bytes: 42, sha256: 'c'.repeat(64) },
      ],
    })

    expect(exported.instanceId).toBe(deploymentManifest.instance.id)
    expect(
      portableExportManifestSchema.safeParse({
        ...exported,
        consistency: { ...exported.consistency, quiescedAt: '2026-07-19T22:00:00.000Z' },
      }).success,
    ).toBe(false)
  })

  it('keeps portable configuration and private export evidence payload-free', () => {
    const configuration = portableConfigurationSchema.parse({
      formatVersion: 1,
      instanceId: deploymentManifest.instance.id,
      settings: { paymentWebhookProvider: 'stripe' },
    })
    const evidence = exportEvidenceSchema.parse({
      formatVersion: 1,
      evidenceId: '42424242-1234-4678-9abc-123456789abc',
      instanceId: deploymentManifest.instance.id,
      sourceApplicationVersion: '0.7.2',
      sourceSchemaVersion: 5,
      sourceManagementProtocolPackageVersion: '0.4.0',
      exportManifestSha256: 'd'.repeat(64),
      exportedAt: '2026-07-19T21:01:00.000Z',
      verifiedAt: '2026-07-19T21:02:00.000Z',
      consistencyMode: 'operator-quiesced',
      verificationStatus: 'verified',
    })

    expect(Object.keys(configuration.settings)).toEqual(['paymentWebhookProvider'])
    expect(JSON.stringify(evidence)).not.toContain('objectKey')
  })

  it('requires unique R2 keys and content-addressed object paths', () => {
    const object = {
      key: 'sermons/week-1.mp3',
      file: `r2/objects/${'e'.repeat(64)}`,
      bytes: 10,
      sha256: 'e'.repeat(64),
    }
    expect(r2ExportIndexSchema.parse({ formatVersion: 1, objects: [object] }).objects).toHaveLength(1)
    expect(
      r2ExportIndexSchema.safeParse({ formatVersion: 1, objects: [object, object] }).success,
    ).toBe(false)
    expect(
      r2ExportIndexSchema.safeParse({
        formatVersion: 1,
        objects: [{ ...object, file: '../payload' }],
      }).success,
    ).toBe(false)
  })

  it('requires complete import sequencing, exact release compatibility, and bound cutover approval', () => {
    const stepKinds = [
      'verify-export',
      'verify-release-compatibility',
      'verify-destination-manifest',
      'verify-new-empty-d1',
      'verify-new-empty-r2',
      'restore-d1',
      'restore-r2',
      'apply-forward-migrations',
      'deploy-without-domains',
      'rotate-deployment-credentials',
      'rotate-application-secrets',
      'rotate-management-credentials',
      'verify-restored-identity',
      'verify-runtime',
      'cutover-domains',
      'verify-independent-operation',
      'retire-source-routing',
    ] as const
    const risks = [
      ...Array(5).fill('read-only'),
      ...Array(4).fill('writes-destination'),
      ...Array(3).fill('credential-change'),
      'read-only',
      'read-only',
      'cutover',
      'read-only',
      'source-change',
    ]
    const plan = importPlanSchema.parse({
      formatVersion: 1,
      operationId: '42424242-1234-4678-9abc-123456789abc',
      generatedAt: '2026-07-19T22:00:00.000Z',
      instanceId: deploymentManifest.instance.id,
      exportManifestSha256: 'a'.repeat(64),
      destinationManifestSha256: 'b'.repeat(64),
      sourceRelease: deploymentManifest.instance.release,
      destinationRelease: deploymentManifest.instance.release,
      destinationEnvironment: 'production',
      steps: stepKinds.map((kind, index) => ({
        id: `import-${String(index + 1).padStart(2, '0')}`,
        kind,
        risk: risks[index],
        resourceName: null,
        dependsOn: index === 0 ? [] : [`import-${String(index).padStart(2, '0')}`],
        approvalRequired: kind === 'cutover-domains' || kind === 'retire-source-routing',
      })),
    })
    expect(plan.steps).toHaveLength(17)
    expect(
      importPlanSchema.safeParse({
        ...plan,
        steps: plan.steps.map((step) =>
          step.kind === 'restore-d1' ? { ...step, risk: 'read-only' } : step,
        ),
      }).success,
    ).toBe(false)

    expect(
      cutoverApprovalSchema.parse({
        formatVersion: 1,
        operationId: plan.operationId,
        instanceId: plan.instanceId,
        exportManifestSha256: plan.exportManifestSha256,
        destinationManifestSha256: plan.destinationManifestSha256,
        approvedAt: '2026-07-19T22:30:00.000Z',
        approvedBy: 'user:operator_42',
        sourceVerifiedAt: '2026-07-19T22:20:00.000Z',
        destinationVerifiedAt: '2026-07-19T22:25:00.000Z',
        credentialDisposition: {
          deployment: 'rotated',
          applicationSecrets: 'rotated',
          management: 'disconnected',
        },
        domains: ['new.example.org'],
        rollbackDeadline: '2026-07-20T22:30:00.000Z',
      }).domains,
    ).toEqual(['new.example.org'])
  })
})
