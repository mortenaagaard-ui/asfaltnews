async function archiveData(indtastetData) {
    try {
        const response = await fetch('/api/update-github-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Nu sender vi bare selve objektet afsted under navnet "newData"
            body: JSON.stringify({ newData: indtastetData })
        });
        
        const result = await response.json();
        if (result.success) {
            console.log('Nyt element blev pushet til data.json i GitHub.');
            alert('Elementet blev arkiveret!');
        } else {
            console.error('Arkivering fejlede:', result.error);
        }
    } catch (error) {
        console.error('Netværksfejl under arkivering:', error);
    }
}
