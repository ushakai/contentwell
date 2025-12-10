import React, { useState, ChangeEvent } from 'react';
import { ColumnMapping } from '../types';
import { getCsvPreview, parseCsvWithMapping, ParsedContact } from '../utils/csvHelper';
import { detectCsvColumns } from '../services/geminiService';
import { supabase } from '../utils/supabaseClient';

import SparklesIcon from './icons/SparklesIcon';
import FileIcon from './icons/FileIcon';
import InfoIcon from './icons/InfoIcon';
import LoaderIcon from './icons/LoaderIcon';

type UploadStage = 'upload' | 'preview';

interface ContactUploadProps {
  campaignId: string | number;
  onSuccess: () => void;
}

const requiredFields: (keyof ColumnMapping)[] = ['firstName', 'lastName', 'email', 'company', 'title'];

const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '');

const createEmptyMapping = (): ColumnMapping => ({
  firstName: '',
  lastName: '',
  email: '',
  company: '',
  title: '',
});

const ContactUpload: React.FC<ContactUploadProps> = ({ campaignId, onSuccess }) => {
  const [stage, setStage] = useState<UploadStage>('upload');
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(createEmptyMapping());
  const [analysisDetails, setAnalysisDetails] = useState<{ invalidRows: number; headers: string[] } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const resetState = () => {
    setStage('upload');
    setContacts([]);
    setMapping(createEmptyMapping());
    setAnalysisDetails(null);
    setFileName(null);
    setError(null);
    setIsProcessing(false);
  };

  const normaliseMapping = (aiMapping: ColumnMapping, headers: string[]): ColumnMapping => {
    const normalizedHeaders = headers.map(header => ({
      original: header,
      normalized: normalise(header),
    }));

    const result: ColumnMapping = createEmptyMapping();

    requiredFields.forEach(field => {
      const aiHeader = aiMapping[field];
      if (!aiHeader) {
        result[field] = '';
        return;
      }

      const normalizedAiHeader = normalise(aiHeader);
      const matchedHeader =
        normalizedHeaders.find(h => h.normalized === normalizedAiHeader) ||
        normalizedHeaders.find(h => h.normalized.includes(normalizedAiHeader)) ||
        normalizedHeaders.find(h => normalizedAiHeader.includes(h.normalized));

      result[field] = matchedHeader?.original ?? '';
    });

    return result;
  };

  const analyseCsv = async (content: string) => {
    const preview = getCsvPreview(content, 5);
    if (preview.headers.length === 0) {
      throw new Error('The CSV appears to be empty or missing headers.');
    }

    const rowsForAi = preview.rows.slice(0, 5).map(row => row.join(','));
    const csvSnippet = [preview.headers.join(','), ...rowsForAi].join('\n');

    const aiMapping = await detectCsvColumns(csvSnippet);
    const resolvedMapping = normaliseMapping(aiMapping, preview.headers);
    const missingFields = requiredFields.filter(field => !resolvedMapping[field]);

    if (missingFields.length > 0) {
      throw new Error(`Unable to identify: ${missingFields.join(', ')}. Please ensure these columns exist.`);
    }

    const { contacts: parsedContacts, invalidRows } = parseCsvWithMapping(content, resolvedMapping);

    if (parsedContacts.length === 0) {
      throw new Error('No complete contacts were found. Each row must include name, email, company, and title.');
    }

    setContacts(parsedContacts);
    setMapping(resolvedMapping);
    setAnalysisDetails({ invalidRows, headers: preview.headers });
    setStage('preview');
  };

  const processFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setIsProcessing(true);
    console.log('[ContactUpload] Processing file', file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) {
          throw new Error('The uploaded file is empty.');
        }
        await analyseCsv(content);
      } catch (err: any) {
        console.error('[ContactUpload] Failed to analyse CSV', err);
        setError(err.message || 'Failed to analyse the CSV.');
        setStage('upload');
        setContacts([]);
        setMapping(createEmptyMapping());
        setAnalysisDetails(null);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
      setStage('upload');
      setContacts([]);
      setMapping(createEmptyMapping());
      setAnalysisDetails(null);
      setIsProcessing(false);
    };
    reader.readAsText(file);
  };

  const handleSaveContacts = async () => {
    if (contacts.length === 0) return;
    setIsProcessing(true);
    setError(null);
    console.log('[ContactUpload] Saving contacts for campaign', campaignId, 'count', contacts.length);

    const contactsToInsert = contacts.map((c, idx) => ({ 
      contact_id: `${campaignId}_${c.email}_${idx}`,
      campaign_id: campaignId,
      company_name: c.company,
      full_name: `${c.firstName} ${c.lastName}`,
      title: c.title,
      email: c.email,
      linkedin_url: '',
      notes: '',
      raw_data: c.raw_data
    }));

    try {
      const { error: insertError } = await supabase.from('contacts').insert(contactsToInsert);
      if (insertError) throw insertError;
      console.log('[ContactUpload] Contacts saved successfully');
      onSuccess();
    } catch (err: any) {
      setError("Failed to save contacts to the database. " + err.message);
      console.error('[ContactUpload] Failed to save contacts', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };
  
  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'text/csv') {
      processFile(file);
    } else {
      setError('Please drop a valid CSV file.');
    }
  };

  if (isProcessing && stage === 'upload') {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 animate-fade-in">
        <LoaderIcon className="h-12 w-12 text-primary" />
        <h3 className="mt-4 text-lg font-semibold text-foreground">Analyzing your CSV...</h3>
        <p className="mt-1 text-sm text-muted-foreground">We’re scanning the first few rows to identify the right columns.</p>
      </div>
    );
  }

  const renderDetectedMapping = () => (
    <div className="rounded-lg border bg-muted/50 p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Detected columns</h4>
          {fileName && <span className="text-xs text-muted-foreground truncate max-w-[200px]">File: {fileName}</span>}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {requiredFields.map(field => (
            <div key={field} className="rounded-md bg-background px-3 py-2 border">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{field.replace(/([A-Z])/g, ' $1')}</dt>
              <dd className="text-sm font-semibold text-foreground mt-1">{mapping[field] || 'Not found'}</dd>
            </div>
          ))}
        </dl>
      </div>
      {analysisDetails && analysisDetails.invalidRows > 0 && (
        <p className="text-sm text-muted-foreground">
          Skipped <strong>{analysisDetails.invalidRows}</strong> row(s) that were missing required data.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {stage === 'upload' && (
        <>
          <div className="flex items-start p-4 text-sm text-info-foreground rounded-lg bg-info/10 border border-info/20" role="alert">
            <InfoIcon className="flex-shrink-0 inline w-5 h-5 mr-3 text-info"/>
            <div>
              <h3 className="font-semibold">Automatic column detection</h3>
              <p className="mt-1">Upload any CSV. We’ll read a few sample rows, identify name, company, title, and email, and tell you if anything is missing—no manual mapping required.</p>
            </div>
          </div>

          <div>
            <label 
              htmlFor="file-upload" 
              className="relative block w-full cursor-pointer"
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className={`flex flex-col items-center justify-center w-full h-56 border-2 border-border border-dashed rounded-lg transition-all duration-300 ${isDragging ? 'bg-primary/10 border-primary scale-105' : 'bg-muted/50'}`}>
                <FileIcon className={`mx-auto h-12 w-12 text-muted-foreground transition-colors ${isDragging ? 'text-primary' : ''}`} />
                <span className="mt-4 block text-base font-semibold text-foreground">Drag & drop your CSV file</span>
                <span className="mt-1 block text-sm text-muted-foreground">or <span className="font-semibold text-primary">click to browse</span></span>
              </div>
              <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".csv" onChange={handleFileChange} />
            </label>
          </div>
        </>
      )}

      {stage === 'preview' && (
        <>
          {renderDetectedMapping()}

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold leading-6 text-foreground">Contact Preview ({contacts.length} total)</h3>
            <p className="mt-1 text-sm text-muted-foreground">Below are the first few contacts we’ll import. Every row is used exactly as it appears in your file.</p>
            <div className="mt-4 flow-root">
              <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted">
                        <tr>
                          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-foreground sm:pl-6">Name</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">Company</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">Title</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card">
                        {contacts.slice(0, 5).map((contact, index) => (
                          <tr key={index}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-foreground sm:pl-6">{contact.firstName} {contact.lastName}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">{contact.company}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">{contact.title}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">{contact.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <button onClick={resetState} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
              ← Upload another file
            </button>
            <button
              onClick={handleSaveContacts}
              disabled={isProcessing}
              className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-all duration-300 ease-in-out bg-primary hover:bg-primary/90 hover:scale-105 disabled:bg-muted disabled:text-muted-foreground disabled:scale-100 disabled:shadow-sm disabled:cursor-not-allowed"
            >
              {isProcessing ? <LoaderIcon className="h-5 w-5 mr-2" /> : <SparklesIcon className="mr-2 h-5 w-5" />}
              <span>{isProcessing ? `Saving ${contacts.length} Contacts...` : `Save ${contacts.length} Contacts`}</span>
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="p-4 mt-4 text-sm text-destructive-foreground bg-destructive rounded-lg" role="alert">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}
    </div>
  );
};

export default ContactUpload;