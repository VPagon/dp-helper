import React, { useCallback, useEffect, useState } from 'react';

import { executeQuery } from '../../services/sqlService';

import {

    COLUMNS_COLLAPSE_THRESHOLD,

    ENTITY_GROUPS,

    buildFetchDleColumnsSql,

    buildToggleReverseSql,

    buildUpdateSql,

    fetchPipelineEnableDisableEntities,

    formatActiveLabel,

    mapDleColumnRow,

    mapDleColumnsBulkRow,

    refreshEntityStatus,

} from '../../utils/pipelineEnableDisable';



function entityRowKey(entity) {

    return `${entity.group}:${entity.isBulk ? 'bulk' : entity.id}`;

}



function PipelineEnableDisableModal({

    visible,

    onClose,

    environment,

    pipelineName,

    pipelineDetails = null,

    onStatusChanged,

}) {

    const [loading, setLoading] = useState(false);

    const [error, setError] = useState(null);

    const [context, setContext] = useState(null);

    const [entities, setEntities] = useState([]);

    const [columnEntities, setColumnEntities] = useState([]);

    const [columnsExpanded, setColumnsExpanded] = useState(false);

    const [confirmState, setConfirmState] = useState(null);

    const [executing, setExecuting] = useState(false);

    const [togglingKey, setTogglingKey] = useState(null);



    const loadEntities = useCallback(async () => {

        if (!pipelineName) return;

        setLoading(true);

        setError(null);

        try {

            const result = await fetchPipelineEnableDisableEntities(

                executeQuery,

                environment,

                pipelineName,

                pipelineDetails

            );

            setContext(result.context);

            setEntities(result.entities);

            setColumnEntities(result.columnEntities);

            setColumnsExpanded(result.columnEntities.length <= COLUMNS_COLLAPSE_THRESHOLD);

        } catch (err) {

            setError(err.message);

            setContext(null);

            setEntities([]);

            setColumnEntities([]);

        } finally {

            setLoading(false);

        }

    }, [environment, pipelineName, pipelineDetails]);



    useEffect(() => {

        if (visible) {

            setConfirmState(null);

            loadEntities();

        }

    }, [visible, loadEntities]);



    const handleClose = () => {

        setConfirmState(null);

        onClose();

    };



    const requestToggle = (entity) => {

        const targetActive = !entity.isActive;

        const sql = buildUpdateSql(entity, targetActive);

        const reverseSql = buildToggleReverseSql(entity, entity.isActive);

        setConfirmState({

            entity,

            targetActive,

            previousActive: entity.isActive,

            sql,

            reverseSql,

        });

    };



    const refreshColumnSection = async (tableId) => {

        if (tableId == null) return;

        const columnsResult = await executeQuery(

            environment,

            buildFetchDleColumnsSql(tableId)

        );

        const cols = (columnsResult.rows ?? []).map((row) =>

            mapDleColumnRow(row, tableId)

        );

        const bulkRow = cols.length > 0 ? mapDleColumnsBulkRow(cols, tableId) : null;

        setColumnEntities((prev) => {

            const rest = prev.filter((col) => String(col.parentTableId) !== String(tableId));

            return [...rest, ...cols];

        });

        setEntities((prev) => {

            const withoutBulk = prev.filter(

                (row) =>

                    !(

                        row.isBulk &&

                        row.group === ENTITY_GROUPS.DLE_COLUMNS &&

                        String(row.parentTableId) === String(tableId)

                    )

            );

            return bulkRow ? [...withoutBulk, bulkRow] : withoutBulk;

        });

    };



    const applyRefreshedEntity = (refreshed) => {

        const key = entityRowKey(refreshed);

        setEntities((prev) =>

            prev.map((row) => (entityRowKey(row) === key ? refreshed : row))

        );

    };



    const executeToggle = async () => {

        if (!confirmState || !context) return;

        const { entity, targetActive, previousActive, sql, reverseSql } = confirmState;

        const rowKey = entityRowKey(entity);



        try {

            setExecuting(true);

            setTogglingKey(rowKey);

            await executeQuery(environment, sql, {

                source: 'pipeline-enable-disable',

                metadata: {

                    pipelineName: context.pipelineName,

                    pipelineId: context.pipelineId,

                    entityGroup: entity.group,

                    entityId: entity.id,

                    identifier: entity.identifier,

                    previousActive,

                    targetActive,

                },

                reverseSql,

            });



            if (entity.isBulk || entity.group === ENTITY_GROUPS.DLE_COLUMNS) {

                await refreshColumnSection(entity.parentTableId);

            } else {

                const refreshed = await refreshEntityStatus(

                    executeQuery,

                    environment,

                    entity,

                    context

                );

                applyRefreshedEntity(refreshed.entity);

            }



            if (entity.group === ENTITY_GROUPS.PIPELINE) {

                onStatusChanged?.();

            }



            setConfirmState(null);

        } catch (err) {

            setError(err.message);

        } finally {

            setExecuting(false);

            setTogglingKey(null);

        }

    };



    const renderActionButton = (entity) => {

        const key = entityRowKey(entity);

        const isBusy = togglingKey === key || executing;

        const label = entity.isActive ? 'Disable' : 'Enable';

        return (

            <button

                type="button"

                className={`ped-action-btn ${entity.isActive ? 'ped-disable' : 'ped-enable'}`}

                disabled={isBusy || loading}

                onClick={() => requestToggle(entity)}

            >

                {isBusy ? '…' : label}

            </button>

        );

    };



    const renderEntityRow = (entity, { isChild = false } = {}) => (

        <tr

            key={entityRowKey(entity)}

            className={`ped-row ${entity.isActive ? 'ped-active' : 'ped-inactive'} ${isChild ? 'ped-child-row' : ''}`}

        >

            <td className="ped-type">{entity.group}</td>

            <td className="ped-identifier">

                <span className="ped-identifier-main">{entity.identifier}</span>

                {entity.secondaryIdentifier && (

                    <span className="ped-identifier-sub">{entity.secondaryIdentifier}</span>

                )}

            </td>

            <td className="ped-status">

                <span className={`ped-status-badge ${entity.isActive ? 'active' : 'inactive'}`}>

                    {formatActiveLabel(entity.isActive)}

                </span>

            </td>

            <td className="ped-action">{renderActionButton(entity)}</td>

        </tr>

    );



    const columnCount = columnEntities.length;

    const showColumnExpand = columnCount > COLUMNS_COLLAPSE_THRESHOLD;

    const bulkColumnEntities = entities.filter(

        (e) => e.isBulk && e.group === ENTITY_GROUPS.DLE_COLUMNS

    );



    const displayEntities = entities.filter(

        (e) => !(e.isBulk && e.group === ENTITY_GROUPS.DLE_COLUMNS)

    );



    if (!visible) return null;



    return (

        <>

            <div className="popup-overlay" onClick={handleClose} />

            <div

                className="pipeline-enable-disable-modal"

                onClick={(e) => e.stopPropagation()}

                role="dialog"

                aria-labelledby="ped-modal-title"

            >

                <div className="popup-header">

                    <div className="ped-header-text">

                        <h3 id="ped-modal-title">Enable / Disable — {pipelineName}</h3>

                        <span className="ped-env-badge">{environment.toUpperCase()}</span>

                    </div>

                    <button type="button" className="close-popup-btn" onClick={handleClose}>

                        ×

                    </button>

                </div>



                <div className="ped-modal-body">

                    {context?.dleJobLookupSource === 'pipeline_name_fallback' && (

                        <div className="ped-resolution-hint">

                            No JOB_NAME parameter — DLE job resolved via pipeline name{' '}

                            <strong>{context.dleJobLookupValue}</strong>

                        </div>

                    )}



                    {context?.dleJobLookupSource === 'JOB_NAME' && context.dleJobLookupValue && (

                        <div className="ped-resolution-hint">

                            DLE job resolved via JOB_NAME{' '}

                            <strong>{context.dleJobLookupValue}</strong>

                            {context.tableName && (

                                <>

                                    {' '}

                                    → target table <strong>{context.tableName}</strong>

                                    {context.dleTableId != null && (

                                        <span className="ped-resolution-id">

                                            {' '}

                                            (id {context.dleTableId})

                                        </span>

                                    )}

                                </>

                            )}

                        </div>

                    )}



                    {(context?.warnings ?? []).map((warning) => (

                        <div key={warning} className="ped-warning">

                            {warning}

                        </div>

                    ))}



                    {error && <div className="ped-error">{error}</div>}



                    {loading ? (

                        <div className="ped-loading">Loading related entities…</div>

                    ) : (

                        <div className="ped-table-wrapper">

                            <table className="ped-table">

                                <thead>

                                    <tr>

                                        <th>Entity type</th>

                                        <th>Identifier</th>

                                        <th>Status</th>

                                        <th>Action</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    {displayEntities.length === 0 && bulkColumnEntities.length === 0 ? (

                                        <tr>

                                            <td colSpan={4} className="ped-empty">

                                                No entities found for this pipeline.

                                            </td>

                                        </tr>

                                    ) : (

                                        displayEntities.map((entity) => renderEntityRow(entity))

                                    )}



                                    {bulkColumnEntities.map((entity) => renderEntityRow(entity))}



                                    {columnCount > 0 && showColumnExpand && (

                                        <tr className="ped-expand-row">

                                            <td colSpan={4}>

                                                <button

                                                    type="button"

                                                    className="ped-expand-btn"

                                                    onClick={() => setColumnsExpanded((v) => !v)}

                                                >

                                                    {columnsExpanded

                                                        ? `Hide ${columnCount} columns`

                                                        : `Show ${columnCount} individual columns`}

                                                </button>

                                            </td>

                                        </tr>

                                    )}



                                    {columnsExpanded &&

                                        columnEntities.map((col) =>

                                            renderEntityRow(col, { isChild: true })

                                        )}

                                </tbody>

                            </table>

                        </div>

                    )}

                </div>



                {confirmState && (

                    <div className="ped-confirm-panel">

                        <h4>

                            Confirm {confirmState.targetActive ? 'Enable' : 'Disable'} —{' '}

                            {confirmState.entity.group}

                        </h4>

                        <p className="ped-confirm-target">

                            <strong>{confirmState.entity.identifier}</strong>

                        </p>

                        <pre className="ped-confirm-sql">{confirmState.sql}</pre>

                        <div className="ped-confirm-actions">

                            <button

                                type="button"

                                className="ped-confirm-cancel"

                                onClick={() => setConfirmState(null)}

                                disabled={executing}

                            >

                                Cancel

                            </button>

                            <button

                                type="button"

                                className="ped-confirm-execute"

                                onClick={executeToggle}

                                disabled={executing}

                            >

                                {executing

                                    ? 'Executing…'

                                    : `Execute on ${environment.toUpperCase()}`}

                            </button>

                        </div>

                    </div>

                )}

            </div>

        </>

    );

}



export default PipelineEnableDisableModal;

