CREATE TABLE answer_analysis (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  source text NOT NULL,
  title text NOT NULL,
  semantic_revision bigint NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('allow','multiple','unsafe','irrelevant')),
  canonical text NOT NULL,
  family text NOT NULL,
  PRIMARY KEY(question_id,source)
);
