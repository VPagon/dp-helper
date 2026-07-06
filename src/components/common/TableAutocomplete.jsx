import React, { useState, useRef, useEffect, useMemo, useId, useCallback } from 'react';

export default function TableAutocomplete({
    tables,
    value,
    onSelect,
    placeholder = 'Type to search tables...',
    disabled = false,
    inputId,
}) {
    const [inputValue, setInputValue] = useState(value || '');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef(null);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const listId = useId();

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    const filteredTables = useMemo(() => {
        const term = inputValue.trim().toLowerCase();
        if (!term) {
            return tables;
        }
        return tables.filter((table) => table[1].toLowerCase().includes(term));
    }, [tables, inputValue]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setHighlightedIndex(filteredTables.length > 0 ? 0 : -1);
    }, [filteredTables, isOpen]);

    useEffect(() => {
        if (!isOpen || highlightedIndex < 0 || !listRef.current) {
            return;
        }
        const item = listRef.current.children[highlightedIndex];
        item?.scrollIntoView({ block: 'nearest' });
    }, [highlightedIndex, isOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
                setInputValue(value || '');
                setHighlightedIndex(-1);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value]);

    const selectTable = useCallback((table) => {
        onSelect(table);
        setInputValue(table[1]);
        setIsOpen(false);
        setHighlightedIndex(-1);
    }, [onSelect]);

    const handleKeyDown = (event) => {
        if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setIsOpen(true);
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (filteredTables.length === 0) {
                    return;
                }
                setHighlightedIndex((prev) => (
                    prev < filteredTables.length - 1 ? prev + 1 : prev
                ));
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (filteredTables.length === 0) {
                    return;
                }
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                event.preventDefault();
                if (highlightedIndex >= 0 && filteredTables[highlightedIndex]) {
                    selectTable(filteredTables[highlightedIndex]);
                } else if (filteredTables.length === 1) {
                    selectTable(filteredTables[0]);
                }
                break;
            case 'Escape':
                event.preventDefault();
                setIsOpen(false);
                setInputValue(value || '');
                setHighlightedIndex(-1);
                inputRef.current?.blur();
                break;
            default:
                break;
        }
    };

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
        setIsOpen(true);
    };

    const activeOptionId = highlightedIndex >= 0
        ? `${listId}-option-${highlightedIndex}`
        : undefined;

    return (
        <div className="table-autocomplete" ref={containerRef}>
            <input
                ref={inputRef}
                id={inputId}
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete="off"
            />
            {isOpen && (
                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    className="table-autocomplete__list"
                >
                    {tables.length === 0 ? (
                        <li className="table-autocomplete__empty" role="status">
                            No tables available
                        </li>
                    ) : filteredTables.length === 0 ? (
                        <li className="table-autocomplete__empty" role="status">
                            No matching tables
                        </li>
                    ) : (
                        filteredTables.map((table, index) => (
                            <li
                                key={`${table[0]}-${table[1]}`}
                                id={`${listId}-option-${index}`}
                                role="option"
                                aria-selected={index === highlightedIndex}
                                className={
                                    index === highlightedIndex
                                        ? 'table-autocomplete__option table-autocomplete__option--highlighted'
                                        : 'table-autocomplete__option'
                                }
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectTable(table)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {table[1]}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}
