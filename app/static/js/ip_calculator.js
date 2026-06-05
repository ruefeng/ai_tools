document.addEventListener('DOMContentLoaded', () => {
    const ipv4DataTextarea = document.getElementById('ipv4-address-textarea');
    const ipv6DataTextarea = document.getElementById('ipv6-address-textarea');
    const calculateButton = document.getElementById('calculate-button');
    const calculated4DataTextarea = document.getElementById('calculated4-data-textarea');
    const calculated6DataTextarea = document.getElementById('calculated6-data-textarea');
    const resultTableBody = document.getElementById('result-table-body');
    const copyButton = document.getElementById('copy-selected-button');
    const addRowButton = document.getElementById('add-row-button');
    const clearTableButton = document.getElementById('clear-table-button');
    const inputTableBody = document.getElementById('input-table-body');

    let selectionStart = null;
    let selectionEnd = null;
    let isSelecting = false;

    initInputTable();

    if (calculateButton) {
        calculateButton.addEventListener('click', async () => {
            collectDataFromTable();
            const ipv4Data = ipv4DataTextarea.value;
            const ipv6Data = ipv6DataTextarea.value;

            const jsonData = {
                ipv4_data: ipv4Data,
                ipv6_data: ipv6Data
            };

            try {
                const response = await fetch('/main/calculated_ip', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(jsonData)
                });

                const result = await response.json();
                if (response.ok) {
                    calculated4DataTextarea.value = result.ipv4_results_text;
                    calculated6DataTextarea.value = result.ipv6_results_text;
                    
                    if (result.formatted_ipv4_input !== undefined) {
                        ipv4DataTextarea.value = result.formatted_ipv4_input;
                    }
                    if (result.formatted_ipv6_input !== undefined) {
                        ipv6DataTextarea.value = result.formatted_ipv6_input;
                    }
                    
                    renderResultTable(result);
                    clearSelection();
                    updateInputTableFromTextarea();
                } else {
                    alert('IP计算失败: ' + result.message);
                }
            } catch (error) {
                console.error('IP计算失败:', error);
                alert('IP计算失败，请检查网络连接或后端服务。');
            }
        });
    }

    if (copyButton) {
        copyButton.addEventListener('click', () => copySelectedCells(false, true));
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            const selectedCells = document.querySelectorAll('#result-table td.selected');
            if (selectedCells.length > 0) {
                e.preventDefault();
                copySelectedCells(false);
            }
        }
    });

    if (addRowButton) {
        addRowButton.addEventListener('click', () => {
            addInputTableRow();
        });
    }

    if (clearTableButton) {
        clearTableButton.addEventListener('click', () => {
            clearInputTable();
        });
    }
});

function initInputTable() {
    const tbody = document.getElementById('input-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        addInputTableRow();
    }
    attachInputTableEventListeners();
}

function addInputTableRow() {
    const tbody = document.getElementById('input-table-body');
    if (!tbody) return;
    
    const row = document.createElement('tr');
    row.dataset.index = tbody.children.length;
    
    const cell1 = document.createElement('td');
    const input1 = document.createElement('input');
    input1.type = 'text';
    input1.placeholder = '输入IPv4地址';
    input1.className = 'ipv4-input';
    cell1.appendChild(input1);
    row.appendChild(cell1);
    
    const cell2 = document.createElement('td');
    const input2 = document.createElement('input');
    input2.type = 'text';
    input2.placeholder = '输入IPv6地址';
    input2.className = 'ipv6-input';
    cell2.appendChild(input2);
    row.appendChild(cell2);
    
    const cell3 = document.createElement('td');
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-row-button';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', (e) => {
        e.target.closest('tr').remove();
        updateRowIndices();
    });
    cell3.appendChild(deleteButton);
    row.appendChild(cell3);
    
    tbody.appendChild(row);
}

function updateRowIndices() {
    const rows = document.querySelectorAll('#input-table-body tr');
    rows.forEach((row, index) => {
        row.dataset.index = index;
    });
}

function clearInputTable() {
    const tbody = document.getElementById('input-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        addInputTableRow();
    }
}

function attachInputTableEventListeners() {
    const tbody = document.getElementById('input-table-body');
    if (!tbody) return;
    
    tbody.addEventListener('paste', (e) => {
        const target = e.target;
        if (target.tagName !== 'INPUT') return;
        
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text');
        handlePaste(pasteData, target);
    });
}

function handlePaste(pasteData, target) {
    const rows = pasteData.split(/\r?\n/).filter(row => row.trim());
    const currentRow = target.closest('tr');
    if (!currentRow) return;
    
    const startIndex = parseInt(currentRow.dataset.index);
    const startCol = target.classList.contains('ipv4-input') ? 0 : 1;
    
    const tbody = document.getElementById('input-table-body');
    if (!tbody) return;
    
    let existingRows = Array.from(tbody.children);
    const neededRows = startIndex + rows.length;
    
    while (existingRows.length < neededRows) {
        addInputTableRow();
        existingRows = Array.from(tbody.children);
    }
    
    rows.forEach((rowData, rowOffset) => {
        const rowIndex = startIndex + rowOffset;
        const cols = rowData.split('\t');
        
        const targetRow = existingRows[rowIndex];
        if (!targetRow) return;
        
        const ipv4Input = targetRow.querySelector('.ipv4-input');
        const ipv6Input = targetRow.querySelector('.ipv6-input');
        
        if (startCol === 0) {
            if (ipv4Input && cols[0]) ipv4Input.value = cols[0].trim();
            if (ipv6Input && cols[1]) ipv6Input.value = cols[1].trim();
        } else {
            if (ipv6Input && cols[0]) ipv6Input.value = cols[0].trim();
            if (ipv4Input && cols[1]) ipv4Input.value = cols[1].trim();
        }
    });
}

function collectDataFromTable() {
    const tbody = document.getElementById('input-table-body');
    if (!tbody) return;
    
    const ipv4Values = [];
    const ipv6Values = [];
    
    Array.from(tbody.children).forEach(row => {
        const ipv4Input = row.querySelector('.ipv4-input');
        const ipv6Input = row.querySelector('.ipv6-input');
        
        if (ipv4Input && ipv4Input.value.trim()) {
            ipv4Values.push(ipv4Input.value.trim());
        } else {
            ipv4Values.push('');
        }
        
        if (ipv6Input && ipv6Input.value.trim()) {
            ipv6Values.push(ipv6Input.value.trim());
        } else {
            ipv6Values.push('');
        }
    });
    
    const ipv4Textarea = document.getElementById('ipv4-address-textarea');
    const ipv6Textarea = document.getElementById('ipv6-address-textarea');
    
    if (ipv4Textarea) {
        ipv4Textarea.value = ipv4Values.join('\n');
    }
    if (ipv6Textarea) {
        ipv6Textarea.value = ipv6Values.join('\n');
    }
}

function updateInputTableFromTextarea() {
    const ipv4Textarea = document.getElementById('ipv4-address-textarea');
    const ipv6Textarea = document.getElementById('ipv6-address-textarea');
    const tbody = document.getElementById('input-table-body');
    
    if (!ipv4Textarea || !ipv6Textarea || !tbody) return;
    
    const ipv4Lines = ipv4Textarea.value.split(/\r?\n/);
    const ipv6Lines = ipv6Textarea.value.split(/\r?\n/);
    
    const maxLines = Math.max(ipv4Lines.length, ipv6Lines.length);
    tbody.innerHTML = '';
    
    for (let i = 0; i < maxLines; i++) {
        addInputTableRow();
        const row = tbody.lastChild;
        if (!row) continue;
        
        const ipv4Input = row.querySelector('.ipv4-input');
        const ipv6Input = row.querySelector('.ipv6-input');
        
        if (ipv4Input && ipv4Lines[i]) {
            ipv4Input.value = ipv4Lines[i].trim();
        }
        if (ipv6Input && ipv6Lines[i]) {
            ipv6Input.value = ipv6Lines[i].trim();
        }
    }
    
    attachInputTableEventListeners();
}

function renderResultTable(result) {
    const tableBody = document.getElementById('result-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    const ipv4Input = result.formatted_ipv4_array || [];
    const ipv6Input = result.formatted_ipv6_array || [];
    const ipv4Result = result.ipv4_results_array || [];
    const ipv6Result = result.ipv6_results_array || [];
    
    const maxRows = Math.max(ipv4Input.length, ipv6Input.length, ipv4Result.length, ipv6Result.length);
    
    for (let i = 0; i < maxRows; i++) {
        const row = document.createElement('tr');
        
        const cell1 = document.createElement('td');
        cell1.textContent = ipv4Input[i] || '';
        cell1.dataset.row = i;
        cell1.dataset.col = 0;
        row.appendChild(cell1);
        
        const cell2 = document.createElement('td');
        cell2.textContent = ipv6Input[i] || '';
        cell2.dataset.row = i;
        cell2.dataset.col = 1;
        row.appendChild(cell2);
        
        const cell3 = document.createElement('td');
        cell3.textContent = ipv4Result[i] || '';
        cell3.dataset.row = i;
        cell3.dataset.col = 2;
        row.appendChild(cell3);
        
        const cell4 = document.createElement('td');
        cell4.textContent = ipv6Result[i] || '';
        cell4.dataset.row = i;
        cell4.dataset.col = 3;
        row.appendChild(cell4);
        
        tableBody.appendChild(row);
    }

    attachTableEventListeners();
}

function attachTableEventListeners() {
    const table = document.getElementById('result-table');
    if (!table) return;

    table.addEventListener('mousedown', (e) => {
        const cell = e.target.closest('td');
        if (!cell) return;
        
        e.preventDefault();
        isSelecting = true;
        selectionStart = {
            row: parseInt(cell.dataset.row),
            col: parseInt(cell.dataset.col)
        };
        selectionEnd = { ...selectionStart };
        highlightSelection();
    });

    table.addEventListener('mousemove', (e) => {
        if (!isSelecting || !selectionStart) return;
        
        const cell = e.target.closest('td');
        if (!cell) return;
        
        selectionEnd = {
            row: parseInt(cell.dataset.row),
            col: parseInt(cell.dataset.col)
        };
        highlightSelection();
    });

    document.addEventListener('mouseup', () => {
        isSelecting = false;
    });

    document.addEventListener('click', (e) => {
        const table = document.getElementById('result-table');
        if (!table.contains(e.target) && e.target.id !== 'copy-selected-button') {
            clearSelection();
        }
    });
}

function clearSelection() {
    selectionStart = null;
    selectionEnd = null;
    isSelecting = false;
    const cells = document.querySelectorAll('#result-table td.selected');
    cells.forEach(cell => cell.classList.remove('selected'));
}

function highlightSelection() {
    if (!selectionStart || !selectionEnd) return;

    const minRow = Math.min(selectionStart.row, selectionEnd.row);
    const maxRow = Math.max(selectionStart.row, selectionEnd.row);
    const minCol = Math.min(selectionStart.col, selectionEnd.col);
    const maxCol = Math.max(selectionStart.col, selectionEnd.col);

    const cells = document.querySelectorAll('#result-table td');
    cells.forEach(cell => {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        
        if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
            cell.classList.add('selected');
        } else {
            cell.classList.remove('selected');
        }
    });
}

function copySelectedCells(showAlert = true, showToast = false) {
    const selectedCells = document.querySelectorAll('#result-table td.selected');
    if (selectedCells.length === 0) {
        if (showAlert) {
            alert('请先选择要复制的单元格');
        }
        return;
    }

    const minRow = Math.min(...Array.from(selectedCells).map(c => parseInt(c.dataset.row)));
    const maxRow = Math.max(...Array.from(selectedCells).map(c => parseInt(c.dataset.row)));
    const minCol = Math.min(...Array.from(selectedCells).map(c => parseInt(c.dataset.col)));
    const maxCol = Math.max(...Array.from(selectedCells).map(c => parseInt(c.dataset.col)));

    let clipboardText = '';
    for (let row = minRow; row <= maxRow; row++) {
        const rowCells = [];
        for (let col = minCol; col <= maxCol; col++) {
            const cell = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
            rowCells.push(cell ? cell.textContent : '');
        }
        clipboardText += rowCells.join('\t') + '\n';
    }

    navigator.clipboard.writeText(clipboardText).then(() => {
        if (showAlert) {
            alert('已复制到剪贴板！');
        }
        if (showToast) {
            showButtonToast('已复制！');
        }
    }).catch(err => {
        console.error('复制失败:', err);
        if (showAlert) {
            alert('复制失败，请手动复制');
        }
        if (showToast) {
            showButtonToast('复制失败');
        }
    });
}

function showButtonToast(message) {
    const button = document.getElementById('copy-selected-button');
    if (!button) return;

    const toast = document.createElement('span');
    toast.textContent = message;
    toast.style.cssText = `
        position: absolute;
        top: -30px;
        right: 0;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 0.8rem;
        white-space: nowrap;
        opacity: 0;
        transform: translateY(5px);
        transition: opacity 0.2s, transform 0.2s;
    `;
    
    button.style.position = 'relative';
    button.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-5px)';
        setTimeout(() => {
            toast.remove();
        }, 200);
    }, 1500);
}
