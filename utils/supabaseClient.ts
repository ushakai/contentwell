import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rpbprscvagtgjyugirtc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYnByc2N2YWd0Z2p5dWdpcnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTgyMDgsImV4cCI6MjA3Mzc3NDIwOH0.6zt6_vzN3H6CGkBrzTA9PDEEM2eVs7H-TPYM0zFRKNM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);