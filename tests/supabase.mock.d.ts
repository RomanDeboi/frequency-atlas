declare module '@supabase/supabase-js' {
  export interface SupabaseClient {
    from(table: string): any;
    rpc(name: string, args: Record<string, unknown>): Promise<any>;
    storage: { from(bucket: string): any };
  }
}
