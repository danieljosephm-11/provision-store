import 'dotenv/config';

// Shared test environment. Unit tests for pure business logic do not need the
// database; integration tests that do should connect explicitly and clean up
// the `provision_store_test` database (see TEST_DATABASE_URL in .env).
