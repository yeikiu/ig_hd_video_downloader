const IS_FIREFOX = 'browser' in window;

export const downloadFile = (downloadUrl: string, progress: ((this: XMLHttpRequest, ev: ProgressEvent) => void) | null = null) =>
    new Promise<Blob>((resolve, reject) => {
        console.log('[downloadFile] Starting download:', downloadUrl.substring(0, 100) + '...');
        const xhr = new XMLHttpRequest();

        xhr.open('GET', downloadUrl);
        if (IS_FIREFOX) {
            xhr.setRequestHeader('User-Agent', 'curl/7.64.1');
        }

        xhr.onprogress = progress;

        xhr.onload = function(): void {
            console.log('[downloadFile] XHR onload - Status:', xhr.status, 'Response type:', typeof xhr.response);
            if (xhr.status !== 200) {
                console.error('[downloadFile] HTTP error status:', xhr.status, xhr.statusText);
                reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                return;
            }
            const blob: Blob = this.response;
            console.log('[downloadFile] Blob received - Size:', blob.size, 'Type:', blob.type);
            resolve(blob);
        };

        xhr.onerror = function(e) {
            console.error('[downloadFile] XHR error event:', e);
            reject(new Error('Network request failed'));
        };

        xhr.ontimeout = function() {
            console.error('[downloadFile] XHR timeout');
            reject(new Error('Request timeout'));
        };

        xhr.responseType = 'blob';
        console.log('[downloadFile] Sending XHR request...');
        xhr.send();
    });
