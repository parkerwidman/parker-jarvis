grant select, update on table
  public.plaid_connections
to service_role;

grant select, insert, update on table
  public.plaid_finance_account_mappings,
  public.plaid_finance_transaction_mappings,
  public.plaid_transaction_match_review_items,
  public.finance_accounts,
  public.finance_transactions
to service_role;

grant select, insert on table
  public.plaid_transaction_match_review_candidates,
  public.finance_categories,
  public.finance_preferences,
  public.life_areas
to service_role;
