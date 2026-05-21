package com.example.jobportal.repository;

import com.example.jobportal.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface JobRepository extends JpaRepository<Job, Long> {
    List<Job> findByStatus(String status);
    List<Job> findByCompanyId(Long companyId);
    List<Job> findByTitleContainingIgnoreCaseOrDescriptionContainingIgnoreCaseOrRequiredSkillsContainingIgnoreCase(String title, String description, String skills);
}
