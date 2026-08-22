-- PostgreSQL grants EXECUTE on new functions to the implicit PUBLIC role.
-- Revoking only anon/authenticated is therefore insufficient because both
-- inherit PUBLIC privileges.

revoke execute on all functions in schema public from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
