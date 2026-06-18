const SCHEMA = 'rep_mda';

export const ENTITY_GROUPS = {
    PIPELINE: 'Pipeline',
    DLE_JOB: 'DLE Job',
    DLE_TABLE: 'DLE Table',
    DLE_COLUMNS: 'DLE Columns',
    SERVING_LAYER: 'Serving Layer',
    DQ_TABLE: 'DQ Table',
    DQ_COMPARE: 'DQ Compare',
    DQ_REFERENTIAL: 'DQ Referential',
    DQ_CUSTOM_RULE: 'DQ Custom Rule',
};

export const COLUMNS_COLLAPSE_THRESHOLD = 20;

export function escapeSqlLiteral(value) {
    return String(value ?? '').replace(/'/g, "''");
}

export function parseActiveValue(value) {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    return Boolean(value);
}

export function formatActiveValueForUpdate(active) {
    return active ? 1 : 0;
}

export function formatActiveLabel(active) {
    return active ? 'Active' : 'Inactive';
}

function sqlId(value) {
    const num = Number(value);
    if (Number.isFinite(num)) return String(num);
    return `'${escapeSqlLiteral(value)}'`;
}

/** parameters row: [?, pipeline_id?, parameter_name, parameter_value] — name at index 2 */
export function findPipelineParameter(parameters, parameterName) {
    const target = parameterName.toUpperCase();
    return (parameters ?? []).find(
        (param) => String(param[2] ?? '').trim().toUpperCase() === target
    );
}

export function collectDleTableIdsFromJobs(dleJobs) {
    return [
        ...new Set(
            (dleJobs ?? []).flatMap((job) =>
                [job[1], job[2]].filter((id) => id != null && id !== '')
            )
        ),
    ];
}

/** Target DLE table ids only (tgt_dle_tbe_id) — used for DQ rule lookup. */
export function collectDqDleTableIdsFromJobs(dleJobs) {
    return [
        ...new Set(
            (dleJobs ?? [])
                .map((job) => job[1])
                .filter((id) => id != null && id !== '')
        ),
    ];
}

/**
 * @typedef {object} PipelineEntity
 * @property {string} group
 * @property {string} schemaTable
 * @property {string} activeColumn
 * @property {string} keyColumn
 * @property {string|number} id
 * @property {string} identifier
 * @property {string} [secondaryIdentifier]
 * @property {boolean} isActive
 * @property {boolean} [isBulk]
 * @property {number} [bulkCount]
 * @property {string} [parentTableId]
 */

/**
 * @typedef {object} ResolvedPipelineContext
 * @property {number|string} pipelineId
 * @property {string} pipelineName
 * @property {boolean} pipelineEnabled
 * @property {string|null} jobName
 * @property {boolean} jobNameMissing
 * @property {string} dleJobLookupSource
 * @property {string} dleJobLookupValue
 * @property {(number|string)[]} dleTableIds
 * @property {number|string|null} tgtDleTbeId
 * @property {number|string|null} dleTableId
 * @property {string|null} tableName
 * @property {string[]} warnings
 */

export function buildResolvePipelineSql(pipelineName) {
    const name = escapeSqlLiteral(pipelineName);
    return `SELECT pipeline_id, pipeline_name, enabled
FROM ${SCHEMA}.mda_ocn_pipelines
WHERE pipeline_name = '${name}'`;
}

export function buildResolveJobNameSql(pipelineId) {
    return `SELECT parameter_value
FROM ${SCHEMA}.mda_ocn_pipeline_parameters
WHERE pipeline_id = ${sqlId(pipelineId)}
  AND UPPER(LTRIM(RTRIM(parameter_name))) = 'JOB_NAME'`;
}

export function buildResolvePipelineParametersSql(pipelineId) {
    return `SELECT * FROM ${SCHEMA}.mda_ocn_pipeline_parameters WHERE pipeline_id = ${sqlId(pipelineId)}`;
}

export function buildResolveDleJobSql(jobName) {
    const escaped = escapeSqlLiteral(jobName);
    return `SELECT id, tgt_dle_tbe_id, job_name, is_active
FROM ${SCHEMA}.mda_dle_jobs
WHERE job_name = '${escaped}'`;
}

export function buildResolveDleJobsFullSql(jobName) {
    const escaped = escapeSqlLiteral(jobName);
    return `SELECT * FROM ${SCHEMA}.mda_dle_jobs WHERE job_name = '${escaped}'`;
}

export function buildResolveDleTablesSql(dleTableIds) {
    const ids = dleTableIds.map(sqlId).join(', ');
    return `SELECT id, schema_name, table_name, directory, alias, is_active
FROM ${SCHEMA}.mda_dle_tables
WHERE id IN (${ids})`;
}

export function buildResolveDleTableSql(dleTableId) {
    return `SELECT id, table_name, is_active
FROM ${SCHEMA}.mda_dle_tables
WHERE id = ${sqlId(dleTableId)}`;
}

export function buildFetchPipelineEntitySql(pipelineId) {
    return `SELECT pipeline_id, pipeline_name, enabled
FROM ${SCHEMA}.mda_ocn_pipelines
WHERE pipeline_id = ${sqlId(pipelineId)}`;
}

export function buildFetchDleJobEntitySql(jobName) {
    return buildResolveDleJobSql(jobName);
}

export function buildFetchDleTableEntitySql(dleTableId) {
    return buildResolveDleTableSql(dleTableId);
}

export function buildFetchDleColumnsSql(dleTableId) {
    return `SELECT id, column_name, is_active
FROM ${SCHEMA}.mda_dle_columns
WHERE dle_tbe_id = ${sqlId(dleTableId)}
ORDER BY id`;
}

export function buildFetchServingLayerSql(dleTableId) {
    return `SELECT sl.id, sl.key_slr_tbe, sl.is_active
FROM ${SCHEMA}.mda_dle_serving_layer_tables sl
INNER JOIN ${SCHEMA}.mda_dle_tables dt
  ON TRY_CAST(JSON_VALUE(sl.source_object_settings, '$.dle_tbe_id') AS INT) = dt.id
WHERE dt.id = ${sqlId(dleTableId)}`;
}

export function buildFetchDqTablesSql(dleTableId) {
    return `SELECT id, table_definition_key, is_active
FROM ${SCHEMA}.mda_dq_tables
WHERE table_definition_key = ${sqlId(dleTableId)}`;
}

export function buildFetchDqCompareSql(dqTableIds) {
    const ids = dqTableIds.map(sqlId).join(', ');
    return `SELECT id, key_dq_cmp, is_active
FROM ${SCHEMA}.mda_dq_compare_tables
WHERE dq_tbe_id IN (${ids})
   OR dq_tbe_id_referential IN (${ids})`;
}

export function buildFetchDqReferentialSql(dqTableIds) {
    const ids = dqTableIds.map(sqlId).join(', ');
    return `SELECT id, key_dq_ref, is_active
FROM ${SCHEMA}.mda_dq_referential_integrities
WHERE dq_tbe_id IN (${ids})
   OR dq_tbe_id_lookup IN (${ids})`;
}

export function buildFetchDqCustomRulesSql(dqTableIds) {
    const ids = dqTableIds.map(sqlId).join(', ');
    return `SELECT id, rule_name, is_active
FROM ${SCHEMA}.mda_dq_custom_rules
WHERE dq_tbe_id IN (${ids})`;
}

/** @returns {PipelineEntity} */
function makeEntity({
    group,
    schemaTable,
    activeColumn,
    keyColumn,
    id,
    identifier,
    secondaryIdentifier,
    isActive,
    isBulk = false,
    bulkCount,
    parentTableId,
}) {
    return {
        group,
        schemaTable,
        activeColumn,
        keyColumn,
        id,
        identifier: String(identifier ?? id ?? ''),
        secondaryIdentifier,
        isActive: parseActiveValue(isActive),
        isBulk,
        bulkCount,
        parentTableId,
    };
}

export function buildUpdateSql(entity, targetActive) {
    const value = formatActiveValueForUpdate(targetActive);
    if (entity.isBulk && entity.group === ENTITY_GROUPS.DLE_COLUMNS) {
        return `UPDATE ${SCHEMA}.mda_dle_columns
SET is_active = ${value}
WHERE dle_tbe_id = ${sqlId(entity.parentTableId)}`;
    }
    return `UPDATE ${entity.schemaTable}
SET ${entity.activeColumn} = ${value}
WHERE ${entity.keyColumn} = ${sqlId(entity.id)}`;
}

export function buildToggleReverseSql(entity, previousActive) {
    return buildUpdateSql(entity, previousActive);
}

export function mapPipelineRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.PIPELINE,
        schemaTable: `${SCHEMA}.mda_ocn_pipelines`,
        activeColumn: 'enabled',
        keyColumn: 'pipeline_id',
        id: row[0],
        identifier: row[1],
        isActive: row[2],
    });
}

/** Full pipeline row from SELECT * (enabled at index 6 on analysis page). */
export function mapPipelineFromDetailsRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.PIPELINE,
        schemaTable: `${SCHEMA}.mda_ocn_pipelines`,
        activeColumn: 'enabled',
        keyColumn: 'pipeline_id',
        id: row[0],
        identifier: row[1],
        isActive: row[6],
    });
}

export function mapDleJobRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.DLE_JOB,
        schemaTable: `${SCHEMA}.mda_dle_jobs`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: row[2],
        secondaryIdentifier: `tgt_dle_tbe_id: ${row[1]}`,
        isActive: row[3],
    });
}

/** Full DLE job row from SELECT * — prefer columns array for is_active when available. */
export function mapDleJobFromFullRow(row, columns) {
    const record = columns?.length ? rowByColumns(columns, row) : null;
    return makeEntity({
        group: ENTITY_GROUPS.DLE_JOB,
        schemaTable: `${SCHEMA}.mda_dle_jobs`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: record?.id ?? row[0],
        identifier: record?.job_name ?? row[3],
        secondaryIdentifier: `tgt: ${record?.tgt_dle_tbe_id ?? row[1] ?? '—'} · src: ${record?.src_dle_tbe_id ?? row[2] ?? '—'}`,
        isActive: record?.is_active ?? row[20],
    });
}

export function mapDleTableRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.DLE_TABLE,
        schemaTable: `${SCHEMA}.mda_dle_tables`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: row[1],
        isActive: row[2],
    });
}

/** Analysis page dleTableRows: id, schema_name, table_name, directory, alias, is_active */
export function mapDleTableFromAnalysisRow(row) {
    const schema = row[1];
    const tableName = row[2];
    const label =
        schema && tableName ? `${schema}.${tableName}` : tableName ?? `id: ${row[0]}`;
    return makeEntity({
        group: ENTITY_GROUPS.DLE_TABLE,
        schemaTable: `${SCHEMA}.mda_dle_tables`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: label,
        secondaryIdentifier: `id: ${row[0]}`,
        isActive: row[5],
    });
}

export function mapDleColumnRow(row, dleTableId) {
    return makeEntity({
        group: ENTITY_GROUPS.DLE_COLUMNS,
        schemaTable: `${SCHEMA}.mda_dle_columns`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: row[1],
        secondaryIdentifier: `id: ${row[0]}`,
        isActive: row[2],
        parentTableId: dleTableId,
    });
}

export function mapDleColumnsBulkRow(columns, dleTableId) {
    const activeCount = columns.filter((c) => parseActiveValue(c.isActive)).length;
    const allActive = columns.length > 0 && activeCount === columns.length;
    return makeEntity({
        group: ENTITY_GROUPS.DLE_COLUMNS,
        schemaTable: `${SCHEMA}.mda_dle_columns`,
        activeColumn: 'is_active',
        keyColumn: 'dle_tbe_id',
        id: `bulk-${dleTableId}`,
        identifier: `All columns (${columns.length})`,
        secondaryIdentifier: `table id ${dleTableId} · ${activeCount} active`,
        isActive: allActive,
        isBulk: true,
        bulkCount: columns.length,
        parentTableId: dleTableId,
    });
}

export function mapServingLayerRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.SERVING_LAYER,
        schemaTable: `${SCHEMA}.mda_dle_serving_layer_tables`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: row[1] ?? `id: ${row[0]}`,
        secondaryIdentifier: `id: ${row[0]}`,
        isActive: row[2],
    });
}

export function rowByColumns(columns, row) {
    if (!columns?.length) return {};
    return columns.reduce((acc, col, i) => {
        acc[col] = row[i];
        return acc;
    }, {});
}

/** Resolve is_active from a DLE job row (SELECT * or explicit columns). */
export function getDleJobIsActive(row, columns) {
    if (columns?.length) {
        return parseActiveValue(rowByColumns(columns, row).is_active);
    }
    return parseActiveValue(row[20]);
}

export function mapServingLayerFromColumnsRow(columns, row) {
    const record = rowByColumns(columns, row);
    return makeEntity({
        group: ENTITY_GROUPS.SERVING_LAYER,
        schemaTable: `${SCHEMA}.mda_dle_serving_layer_tables`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: record.id,
        identifier: record.key_slr_tbe ?? `id: ${record.id}`,
        secondaryIdentifier: `id: ${record.id}`,
        isActive: record.is_active,
    });
}

export function mapDqTableRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.DQ_TABLE,
        schemaTable: `${SCHEMA}.mda_dq_tables`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: `id: ${row[0]}`,
        secondaryIdentifier: `table_definition_key: ${row[1]}`,
        isActive: row[2],
    });
}

export function mapDqCompareRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.DQ_COMPARE,
        schemaTable: `${SCHEMA}.mda_dq_compare_tables`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: row[1] ?? `id: ${row[0]}`,
        secondaryIdentifier: `id: ${row[0]}`,
        isActive: row[2],
    });
}

export function mapDqReferentialRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.DQ_REFERENTIAL,
        schemaTable: `${SCHEMA}.mda_dq_referential_integrities`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: row[1] ?? `id: ${row[0]}`,
        secondaryIdentifier: `id: ${row[0]}`,
        isActive: row[2],
    });
}

export function mapDqCustomRuleRow(row) {
    return makeEntity({
        group: ENTITY_GROUPS.DQ_CUSTOM_RULE,
        schemaTable: `${SCHEMA}.mda_dq_custom_rules`,
        activeColumn: 'is_active',
        keyColumn: 'id',
        id: row[0],
        identifier: row[1] ?? `id: ${row[0]}`,
        secondaryIdentifier: `id: ${row[0]}`,
        isActive: row[2],
    });
}

function buildContextFields({
    pipelineId,
    pipelineName,
    pipelineEnabled,
    jobNameFromParam,
    dleJobLookupSource,
    dleJobLookupValue,
    dleJobs,
    dleJobsColumns,
    dleTableRows,
    warnings,
}) {
    const dleTableIds = collectDleTableIdsFromJobs(dleJobs);
    const tgtDleTbeId = dleJobs?.[0]?.[1] ?? null;
    const primaryTableRow = (dleTableRows ?? []).find(
        (row) => String(row[0]) === String(tgtDleTbeId)
    );
    const tableName = primaryTableRow?.[2] ?? null;

    if ((dleJobs ?? []).length === 0) {
        const label =
            dleJobLookupSource === 'JOB_NAME' ? 'JOB_NAME' : 'pipeline name';
        warnings.push(`No DLE job found for ${label} "${dleJobLookupValue}".`);
    }

    return {
        pipelineId,
        pipelineName,
        pipelineEnabled,
        jobName: jobNameFromParam || null,
        jobNameMissing: !jobNameFromParam,
        dleJobLookupSource,
        dleJobLookupValue,
        dleTableIds,
        tgtDleTbeId,
        dleTableId: tgtDleTbeId,
        tableName,
        dleJobs: dleJobs ?? [],
        dleJobsColumns: dleJobsColumns ?? [],
        dleTableRows: dleTableRows ?? [],
        warnings,
    };
}

export function buildContextFromPipelineDetails(pipelineDetails) {
    const warnings = [];
    const pipelineRow = pipelineDetails.pipeline;
    const parameters = pipelineDetails.parameters ?? [];
    const jobNameParam = findPipelineParameter(parameters, 'JOB_NAME');
    const jobNameFromParam = jobNameParam?.[3]?.trim() || null;

    const dleJobLookupSource =
        pipelineDetails.dleJobLookupSource ??
        (jobNameFromParam ? 'JOB_NAME' : 'pipeline_name_fallback');
    const dleJobLookupValue =
        pipelineDetails.dleJobLookupValue ?? (jobNameFromParam || pipelineRow[1]);

    return buildContextFields({
        pipelineId: pipelineRow[0],
        pipelineName: pipelineRow[1],
        pipelineEnabled: parseActiveValue(pipelineRow[6]),
        jobNameFromParam,
        dleJobLookupSource,
        dleJobLookupValue,
        dleJobs: pipelineDetails.dleJobs ?? [],
        dleJobsColumns: pipelineDetails.dleJobsColumns ?? [],
        dleTableRows: pipelineDetails.dleTableRows ?? [],
        warnings,
    });
}

/**
 * Resolve pipeline context — mirrors PipelineAnalysisPage fetchPipelineDetails job/table lookup.
 * @param {(env: string, sql: string) => Promise<{rows: unknown[]}>} executeQuery
 */
export async function resolvePipelineContext(executeQuery, environment, pipelineName) {
    const warnings = [];
    const pipelineResult = await executeQuery(environment, buildResolvePipelineSql(pipelineName));
    const pipelineRow = pipelineResult.rows?.[0];
    if (!pipelineRow) {
        throw new Error(`Pipeline not found: ${pipelineName}`);
    }

    const pipelineId = pipelineRow[0];
    const resolvedName = pipelineRow[1];
    const pipelineEnabled = parseActiveValue(pipelineRow[2]);

    const paramsResult = await executeQuery(
        environment,
        buildResolvePipelineParametersSql(pipelineId)
    );
    const parameters = paramsResult.rows ?? [];
    const jobNameParam = findPipelineParameter(parameters, 'JOB_NAME');
    const jobNameFromParam = jobNameParam?.[3]?.trim() || null;

    let dleJobLookupSource;
    let dleJobLookupValue;
    if (jobNameFromParam) {
        dleJobLookupSource = 'JOB_NAME';
        dleJobLookupValue = jobNameFromParam;
    } else {
        dleJobLookupSource = 'pipeline_name_fallback';
        dleJobLookupValue = resolvedName;
    }

    const dleJobsResult = await executeQuery(
        environment,
        buildResolveDleJobsFullSql(dleJobLookupValue)
    );
    const dleJobs = dleJobsResult.rows ?? [];
    const dleJobsColumns = dleJobsResult.columns ?? [];
    const dleTableIds = collectDleTableIdsFromJobs(dleJobs);

    let dleTableRows = [];
    if (dleTableIds.length > 0) {
        try {
            const dleTablesResult = await executeQuery(
                environment,
                buildResolveDleTablesSql(dleTableIds)
            );
            dleTableRows = dleTablesResult.rows ?? [];
        } catch (dleErr) {
            warnings.push(`DLE table lookup failed: ${dleErr.message}`);
        }
    }

    return buildContextFields({
        pipelineId,
        pipelineName: resolvedName,
        pipelineEnabled,
        jobNameFromParam,
        dleJobLookupSource,
        dleJobLookupValue,
        dleJobs,
        dleJobsColumns,
        dleTableRows,
        warnings,
    });
}

function dedupeEntitiesByKey(entities) {
    const seen = new Set();
    return entities.filter((entity) => {
        const key = entity.isBulk
            ? `bulk:${entity.group}:${entity.parentTableId}`
            : `${entity.group}:${entity.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function appendColumnsAndDqEntities(
    executeQuery,
    environment,
    context,
    entities,
    columnEntities,
    { servingLayerRows, servingLayerColumns } = {}
) {
    const servingAdded = new Set();
    const addServingEntity = (entity) => {
        const key = String(entity.id);
        if (servingAdded.has(key)) return;
        servingAdded.add(key);
        entities.push(entity);
    };

    if (servingLayerRows?.length && servingLayerColumns?.length) {
        servingLayerRows.forEach((row) => {
            addServingEntity(mapServingLayerFromColumnsRow(servingLayerColumns, row));
        });
    } else {
        for (const tableId of context.dleTableIds) {
            const servingResult = await executeQuery(
                environment,
                buildFetchServingLayerSql(tableId)
            );
            (servingResult.rows ?? []).forEach((row) => {
                addServingEntity(mapServingLayerRow(row));
            });
        }
    }

    for (const tableId of context.dleTableIds) {
        const columnsResult = await executeQuery(
            environment,
            buildFetchDleColumnsSql(tableId)
        );
        const cols = (columnsResult.rows ?? []).map((row) =>
            mapDleColumnRow(row, tableId)
        );
        columnEntities.push(...cols);
        if (cols.length > 0) {
            entities.push(mapDleColumnsBulkRow(cols, tableId));
        }
    }

    const dqTableRowsById = new Map();
    const dqDleTableIds = collectDqDleTableIdsFromJobs(context.dleJobs);
    for (const tableId of dqDleTableIds) {
        const dqTablesResult = await executeQuery(
            environment,
            buildFetchDqTablesSql(tableId)
        );
        (dqTablesResult.rows ?? []).forEach((row) => {
            dqTableRowsById.set(String(row[0]), row);
        });
    }
    const dqTableRows = [...dqTableRowsById.values()];
    dqTableRows.forEach((row) => entities.push(mapDqTableRow(row)));

    const dqTableIds = dqTableRows.map((row) => row[0]).filter((id) => id != null && id !== '');
    if (dqTableIds.length > 0) {
        const [dqCompareResult, dqRefResult, dqCustomResult] = await Promise.all([
            executeQuery(environment, buildFetchDqCompareSql(dqTableIds)),
            executeQuery(environment, buildFetchDqReferentialSql(dqTableIds)),
            executeQuery(environment, buildFetchDqCustomRulesSql(dqTableIds)),
        ]);
        (dqCompareResult.rows ?? []).forEach((row) => entities.push(mapDqCompareRow(row)));
        (dqRefResult.rows ?? []).forEach((row) => entities.push(mapDqReferentialRow(row)));
        (dqCustomResult.rows ?? []).forEach((row) => entities.push(mapDqCustomRuleRow(row)));
    }
}

function buildEntitiesFromLoadedDetails(pipelineDetails, context) {
    const entities = [];

    entities.push(mapPipelineFromDetailsRow(pipelineDetails.pipeline));

    (pipelineDetails.dleJobs ?? []).forEach((job) => {
        entities.push(mapDleJobFromFullRow(job, pipelineDetails.dleJobsColumns));
    });

    const tableRows = pipelineDetails.dleTableRows ?? [];
    if (tableRows.length > 0) {
        tableRows.forEach((row) => entities.push(mapDleTableFromAnalysisRow(row)));
    }

    return dedupeEntitiesByKey(entities);
}

async function fetchMissingDleTables(executeQuery, environment, context, entities) {
    const knownTableIds = new Set(
        entities
            .filter((e) => e.group === ENTITY_GROUPS.DLE_TABLE)
            .map((e) => String(e.id))
    );
    const missingIds = context.dleTableIds.filter((id) => !knownTableIds.has(String(id)));
    if (missingIds.length === 0) return;

    try {
        const result = await executeQuery(
            environment,
            buildResolveDleTablesSql(missingIds)
        );
        (result.rows ?? []).forEach((row) => entities.push(mapDleTableFromAnalysisRow(row)));
    } catch (err) {
        context.warnings.push(`DLE table lookup failed: ${err.message}`);
    }
}

/**
 * Fetch all toggleable entities — uses pipelineDetails when provided (same entities as analysis page).
 * @param {(env: string, sql: string) => Promise<{rows: unknown[]}>} executeQuery
 * @returns {Promise<{ context: ResolvedPipelineContext, entities: PipelineEntity[], columnEntities: PipelineEntity[] }>}
 */
export async function fetchPipelineEnableDisableEntities(
    executeQuery,
    environment,
    pipelineName,
    pipelineDetails = null
) {
    const columnEntities = [];
    let context;
    let entities = [];

    const detailsMatch =
        pipelineDetails?.pipeline &&
        String(pipelineDetails.pipeline[1]) === String(pipelineName);

    if (detailsMatch) {
        context = buildContextFromPipelineDetails(pipelineDetails);
        entities = buildEntitiesFromLoadedDetails(pipelineDetails, context);
        await fetchMissingDleTables(executeQuery, environment, context, entities);
        entities = dedupeEntitiesByKey(entities);

        await appendColumnsAndDqEntities(
            executeQuery,
            environment,
            context,
            entities,
            columnEntities,
            {
                servingLayerRows: pipelineDetails.servingLayerRows,
                servingLayerColumns: pipelineDetails.servingLayerColumns,
            }
        );
    } else {
        context = await resolvePipelineContext(executeQuery, environment, pipelineName);

        const pipelineEntityResult = await executeQuery(
            environment,
            buildFetchPipelineEntitySql(context.pipelineId)
        );
        const pipelineRow = pipelineEntityResult.rows?.[0];
        if (pipelineRow) {
            entities.push(mapPipelineRow(pipelineRow));
        }

        (context.dleJobs ?? []).forEach((job) => {
            entities.push(mapDleJobFromFullRow(job, context.dleJobsColumns));
        });

        const dleTableRows = context.dleTableRows ?? [];
        dleTableRows.forEach((row) => entities.push(mapDleTableFromAnalysisRow(row)));
        await fetchMissingDleTables(executeQuery, environment, context, entities);
        entities = dedupeEntitiesByKey(entities);

        await appendColumnsAndDqEntities(
            executeQuery,
            environment,
            context,
            entities,
            columnEntities
        );
    }

    return {
        context,
        entities: dedupeEntitiesByKey(entities),
        columnEntities,
    };
}

/** Re-fetch a single entity row after toggle. */
export async function refreshEntityStatus(executeQuery, environment, entity, context) {
    if (entity.isBulk) {
        const columnsResult = await executeQuery(
            environment,
            buildFetchDleColumnsSql(entity.parentTableId)
        );
        const columns = (columnsResult.rows ?? []).map((row) =>
            mapDleColumnRow(row, entity.parentTableId)
        );
        return {
            entity: mapDleColumnsBulkRow(columns, entity.parentTableId),
            columnEntities: columns,
        };
    }

    let sql;
    let mapper;
    switch (entity.group) {
        case ENTITY_GROUPS.PIPELINE:
            sql = buildFetchPipelineEntitySql(context.pipelineId);
            mapper = mapPipelineRow;
            break;
        case ENTITY_GROUPS.DLE_JOB:
            sql = buildFetchDleJobEntitySql(context.dleJobLookupValue);
            mapper = (row) => mapDleJobRow(row);
            break;
        case ENTITY_GROUPS.DLE_TABLE:
            sql = buildFetchDleTableEntitySql(entity.id);
            mapper = mapDleTableRow;
            break;
        case ENTITY_GROUPS.DLE_COLUMNS:
            sql = `SELECT id, column_name, is_active FROM ${SCHEMA}.mda_dle_columns WHERE id = ${sqlId(entity.id)}`;
            mapper = (row) => mapDleColumnRow(row, entity.parentTableId);
            break;
        case ENTITY_GROUPS.SERVING_LAYER:
            sql = `SELECT id, key_slr_tbe, is_active FROM ${SCHEMA}.mda_dle_serving_layer_tables WHERE id = ${sqlId(entity.id)}`;
            mapper = mapServingLayerRow;
            break;
        case ENTITY_GROUPS.DQ_TABLE:
            sql = `SELECT id, table_definition_key, is_active FROM ${SCHEMA}.mda_dq_tables WHERE id = ${sqlId(entity.id)}`;
            mapper = mapDqTableRow;
            break;
        case ENTITY_GROUPS.DQ_COMPARE:
            sql = `SELECT id, key_dq_cmp, is_active FROM ${SCHEMA}.mda_dq_compare_tables WHERE id = ${sqlId(entity.id)}`;
            mapper = mapDqCompareRow;
            break;
        case ENTITY_GROUPS.DQ_REFERENTIAL:
            sql = `SELECT id, key_dq_ref, is_active FROM ${SCHEMA}.mda_dq_referential_integrities WHERE id = ${sqlId(entity.id)}`;
            mapper = mapDqReferentialRow;
            break;
        case ENTITY_GROUPS.DQ_CUSTOM_RULE:
            sql = `SELECT id, rule_name, is_active FROM ${SCHEMA}.mda_dq_custom_rules WHERE id = ${sqlId(entity.id)}`;
            mapper = mapDqCustomRuleRow;
            break;
        default:
            return { entity };
    }

    const result = await executeQuery(environment, sql);
    const row =
        (result.rows ?? []).find((r) => String(r[0]) === String(entity.id)) ?? result.rows?.[0];
    if (!row) return { entity };
    return { entity: mapper(row) };
}
