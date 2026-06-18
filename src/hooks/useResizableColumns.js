import { useCallback, useEffect, useRef, useState } from 'react';

export const MIN_COLUMN_WIDTH = 80;
export const DEFAULT_COLUMN_WIDTH = 200;

/**
 * Per-column widths (px) with drag-to-resize on header handles.
 * @param {string[]} columnNames - data column names (excludes actions column)
 * @param {{ minWidth?: number, defaultWidth?: number }} [options]
 */
export function useResizableColumns(columnNames, options = {}) {
    const {
        minWidth = MIN_COLUMN_WIDTH,
        defaultWidth = DEFAULT_COLUMN_WIDTH,
    } = options;

    const [columnWidths, setColumnWidths] = useState({});
    const resizeRef = useRef(null);

    useEffect(() => {
        if (!columnNames?.length) {
            return;
        }
        setColumnWidths((prev) => {
            const next = {};
            columnNames.forEach((name) => {
                next[name] = prev[name] ?? defaultWidth;
            });
            return next;
        });
    }, [columnNames, defaultWidth]);

    const startResize = useCallback(
        (columnName, event) => {
            event.preventDefault();
            event.stopPropagation();

            const startX = event.clientX;
            const startWidth = columnWidths[columnName] ?? defaultWidth;

            resizeRef.current = { columnName, startX, startWidth };

            const onMouseMove = (e) => {
                const { columnName: col, startX: x0, startWidth: w0 } = resizeRef.current || {};
                if (!col) {
                    return;
                }
                const delta = e.clientX - x0;
                const nextWidth = Math.max(minWidth, w0 + delta);
                setColumnWidths((prev) => ({ ...prev, [col]: nextWidth }));
            };

            const onMouseUp = () => {
                resizeRef.current = null;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };

            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        },
        [columnWidths, defaultWidth, minWidth]
    );

    return { columnWidths, startResize };
}
