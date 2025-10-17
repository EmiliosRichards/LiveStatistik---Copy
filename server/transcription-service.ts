interface TranscriptionJob {
  audio_file_id: number;
  status: 'QUEUED' | 'pending' | 'completed' | 'failed';
  b2_key?: string;
  b2_url?: string;
}

interface TranscriptionStatus {
  status: 'pending' | 'completed' | 'failed';
  transcript?: string;
  metadata?: {
    error?: string;
    b2_key?: string;
    bucket?: string;
    size_bytes?: number;
    wall_ms_api?: number;
    wall_ms_total?: number;
    b2_transcript_json_key?: string;
  };
}

class TranscriptionService {
  private readonly API_KEY = process.env.TRANSCRIPTION_API_KEY || '';
  private readonly BASE_URL = 'https://transcribe.vertikon.ltd';

  async submitTranscription(audioUrl: string): Promise<TranscriptionJob> {
    console.log('🎙️ Submitting transcription for:', audioUrl);
    
    const response = await fetch(`${this.BASE_URL}/api/media/transcribe`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        url: audioUrl,
        b2_prefix: 'gateway'
      })
    });

    if (!response.ok) {
      throw new Error(`Transcription submission failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Transcription job submitted:', result);
    return result;
  }

  async getTranscriptionStatus(audioFileId: number): Promise<TranscriptionStatus> {
    console.log('🔍 Checking transcription status for ID:', audioFileId);
    
    const response = await fetch(`${this.BASE_URL}/api/media/status/${audioFileId}`, {
      headers: {
        'X-API-Key': this.API_KEY,
      }
    });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('📊 Transcription status:', result);
    return result;
  }

  async getTranscription(audioUrl: string): Promise<string> {
    try {
      // Submit transcription job
      const job = await this.submitTranscription(audioUrl);
      
      // Poll for completion (with timeout)
      const maxAttempts = 12; // 2 minutes max (10s intervals)
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        const status = await this.getTranscriptionStatus(job.audio_file_id);
        
        if (status.status === 'completed' && status.transcript) {
          console.log('🎉 Transcription completed!');
          return status.transcript;
        }
        
        if (status.status === 'failed') {
          throw new Error('Transcription failed: ' + status.metadata?.error);
        }
        
        attempts++;
        console.log(`⏳ Transcription still pending... (${attempts}/${maxAttempts})`);
      }
      
      throw new Error('Transcription timeout - took longer than 2 minutes');
      
    } catch (error) {
      console.error('❌ Transcription error:', error);
      throw error;
    }
  }
}

export const transcriptionService = new TranscriptionService();