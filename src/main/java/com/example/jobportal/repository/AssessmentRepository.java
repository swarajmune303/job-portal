package com.example.jobportal.repository;

import com.example.jobportal.model.Assessment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AssessmentRepository extends JpaRepository<Assessment, Long> {
    Assessment findByJobId(Long jobId);
}
