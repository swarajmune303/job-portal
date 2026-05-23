package com.example.jobportal.service;

import com.example.jobportal.model.Job;
import com.example.jobportal.repository.JobRepository;
import com.example.jobportal.repository.ApplicationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class JobService {

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    public Job postJob(Job job) {
        job.setStatus("OPEN");
        return jobRepository.save(job);
    }

    public List<Job> getAllJobs() {
        return jobRepository.findAll();
    }
    
    public List<Job> getOpenJobs() {
        return jobRepository.findByStatus("OPEN");
    }

    public Job getJobById(Long id) {
        return jobRepository.findById(id).orElse(null);
    }
    
    public List<Job> getJobsByCompany(Long companyId) {
        return jobRepository.findByCompanyId(companyId);
    }
    
    public List<Job> searchJobs(String query) {
        if (query == null || query.trim().isEmpty()) {
            return getOpenJobs();
        }
        return jobRepository.findByTitleContainingIgnoreCaseOrDescriptionContainingIgnoreCaseOrRequiredSkillsContainingIgnoreCase(query, query, query);
    }

    public boolean deleteJob(Long id) {
        if (jobRepository.existsById(id)) {
            applicationRepository.deleteByJobId(id);
            jobRepository.deleteById(id);
            return true;
        }
        return false;
    }
}
