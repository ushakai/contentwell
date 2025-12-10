import { ColumnMapping, Contact, GeneratedResult } from '../types';

export const getCsvPreview = (fileContent: string, rowCount: number = 5): { headers: string[], rows: string[][] } => {
    const lines = fileContent.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length === 0) {
        return { headers: [], rows: [] };
    }
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1, rowCount + 1).map(line => line.split(',').map(cell => cell.trim()));
    return { headers, rows };
};

export interface ParsedContact extends Omit<Contact, 'id' | 'campaign_id'> {
  raw_data: Record<string, string>;
}

export interface ParsedContactsResult {
  contacts: ParsedContact[];
  invalidRows: number;
}

const REQUIRED_FIELDS: (keyof ColumnMapping)[] = ['firstName', 'lastName', 'email', 'company', 'title'];

const sanitizeRows = (lines: string[]): string[][] =>
  lines.map(line => line.split(',').map(cell => cell.trim()));

const splitFullName = (value: string): { firstName: string; lastName: string } => {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

export const parseCsvWithMapping = (fileContent: string, mapping: ColumnMapping): ParsedContactsResult => {
    const lines = fileContent.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) {
        return { contacts: [], invalidRows: 0 };
    }

    const rawHeaders = lines[0].split(',').map(h => h.trim());
    const headerIndexMap: Record<string, number> = {};
    rawHeaders.forEach((header, index) => {
        headerIndexMap[header] = index;
    });

    const missingColumns = REQUIRED_FIELDS.filter(field => {
        const headerName = mapping[field];
        return !(headerName && headerIndexMap.hasOwnProperty(headerName));
    });

    if (missingColumns.length > 0) {
        throw new Error(`Could not identify columns for: ${missingColumns.join(', ')}`);
    }

    const combinedNameHeader =
      mapping.firstName &&
      mapping.lastName &&
      mapping.firstName === mapping.lastName
        ? mapping.firstName
        : null;

    const dataRows = sanitizeRows(lines.slice(1));
    const contacts: ParsedContact[] = [];
    let invalidRows = 0;

    dataRows.forEach(values => {
        const getValue = (headerName?: string) => {
            if (!headerName) return '';
            const index = headerIndexMap[headerName];
            if (index === undefined) return '';
            return values[index]?.trim() ?? '';
        };
        
        const rawData: Record<string, string> = {};
        rawHeaders.forEach((header, idx) => {
          rawData[header] = values[idx]?.trim() ?? '';
        });

        let firstNameValue = getValue(mapping.firstName);
        let lastNameValue = getValue(mapping.lastName);

        if (combinedNameHeader) {
            const nameParts = splitFullName(firstNameValue);
            firstNameValue = nameParts.firstName;
            lastNameValue = nameParts.lastName || getValue(mapping.lastName);
        }

        const emailValue = getValue(mapping.email);
        const companyValue = getValue(mapping.company);
        const titleValue = getValue(mapping.title);

        if (
          !firstNameValue ||
          !lastNameValue ||
          !emailValue ||
          !companyValue ||
          !titleValue
        ) {
            invalidRows += 1;
            return;
        }

        contacts.push({
            firstName: firstNameValue,
            lastName: lastNameValue,
            email: emailValue,
            company: companyValue,
            title: titleValue,
            raw_data: rawData,
        });
    });

    return { contacts, invalidRows };
};


export const exportToCsv = (results: GeneratedResult[]) => {
  const header = [
    'email',
    'firstName',
    'lastName',
    'company',
    'title',
    'custom_field_1_subject',
    'custom_field_2_body',
    'custom_field_3_research_notes'
  ];

  const rows = results.map(r => [
    `"${r.contact.email}"`,
    `"${r.contact.firstName}"`,
    `"${r.contact.lastName}"`,
    `"${r.contact.company}"`,
    `"${r.contact.title}"`,
    `"${r.subject.replace(/"/g, '""')}"`,
    `"${r.body.replace(/"/g, '""')}"`,
    `"${r.researchSummary.replace(/"/g, '""')}"`,
  ]);

  const csvContent = [header.join(','), ...rows.map(row => row.join(','))].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'smartleads_import.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const extractSmartLeadData = (fileContent: string): { [key: string]: string }[] => {
  const lines = fileContent.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()));

  const headerMapping: { [key: string]: string } = {
    email: 'company_email',
    firstName: 'customer_name',
    company: 'company_name',
    custom_field_1_subject: 'custom_fields.email_subject',
    custom_field_2_body: 'custom_fields.email_content',
  };

  const mappedData = rows.map(row => {
    const mappedRow: { [key: string]: string } = {};
    Object.keys(headerMapping).forEach(key => {
      const headerIndex = headers.indexOf(headerMapping[key]);
      if (headerIndex !== -1) {
        mappedRow[key] = row[headerIndex] || '';
      }
    });
    return mappedRow;
  });

  return mappedData;
};