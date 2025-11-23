// Advanced Number Detection
async function detectActiveNumbers() {
    const numbersText = document.getElementById('detectionNumbers').value;
    
    if (!numbersText) {
        alert('Please enter phone numbers to detect');
        return;
    }
    
    const numbers = numbersText.split('\n').filter(num => num.trim() !== '');
    
    try {
        const response = await fetch('/api/detection/detect-active', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                numbers: numbers
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const resultsDiv = document.getElementById('detectionResults');
            resultsDiv.innerHTML = `
                <div class="alert alert-success">
                    <h4>Detection Results</h4>
                    <p>Total: ${data.total} | Active: ${data.active} | Inactive: ${data.inactive}</p>
                    <p>Active Percentage: ${data.activePercentage}%</p>
                </div>
                <div class="results-list" style="max-height: 300px; overflow-y: auto;">
                    ${data.results.map(result => `
                        <div class="result-item ${result.status === 'active' ? 'text-success' : 'text-danger'}">
                            ${result.number} - ${result.status}
                        </div>
                    `).join('')}
                </div>
            `;
            
            logMessage(`Number detection completed: ${data.active}/${data.total} active numbers found`);
        } else {
            logMessage('Detection failed: ' + data.error);
        }
    } catch (error) {
        logMessage('Detection error: ' + error.message);
    }
}

// Advanced Bulk Messaging with Images
async function sendAdvancedBulk() {
    const numbersText = document.getElementById('advancedNumbers').value;
    const message = document.getElementById('advancedMessage').value;
    const imageFiles = document.getElementById('advancedImages').files;
    const sendTo = document.getElementById('sendTo').value;
    const delayMs = document.getElementById('advancedDelay').value;
    
    if (!message) {
        alert('Please enter a message');
        return;
    }
    
    const formData = new FormData();
    formData.append('message', message);
    formData.append('delayMs', delayMs);
    formData.append('sendTo', sendTo);
    
    if (numbersText) {
        formData.append('contacts', numbersText);
    }
    
    // Add images
    for (let i = 0; i < imageFiles.length; i++) {
        formData.append('images', imageFiles[i]);
    }
    
    try {
        const response = await fetch('/api/advanced/bulk-with-images', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            logMessage(`Advanced bulk messaging completed: ${data.sent}/${data.totalContacts} sent successfully`);
            logMessage(`Images used: ${data.imagesUsed}`);
        } else {
            logMessage('Advanced bulk messaging failed: ' + data.error);
        }
    } catch (error) {
        logMessage('Advanced messaging error: ' + error.message);
    }
}
