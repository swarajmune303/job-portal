package com.example.jobportal.service;

import com.example.jobportal.model.Application;
import com.example.jobportal.model.Job;
import com.example.jobportal.model.User;
import com.example.jobportal.repository.ApplicationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ApplicationService {

    @Autowired
    private ApplicationRepository applicationRepository;

    public Application applyForJob(User user, Job job) {
        Application application = new Application();
        application.setApplicant(user);
        application.setJob(job);
        application.setStatus("APPLIED");
        
        // Basic screening logic: calculate match score
        double score = calculateMatchScore(user.getSkills(), job.getRequiredSkills());
        application.setResumeMatchScore(score);
        
        return applicationRepository.save(application);
    }

    public List<Application> getApplicationsByUser(Long userId) {
        return applicationRepository.findByApplicantId(userId);
    }

    public List<Application> getApplicationsByJob(Long jobId) {
        return applicationRepository.findByJobId(jobId);
    }
    
    public Application updateApplicationStatus(Long applicationId, String status) {
        Application application = applicationRepository.findById(applicationId).orElse(null);
        if (application != null) {
            application.setStatus(status);
            return applicationRepository.save(application);
        }
        return null;
    }

    private double calculateMatchScore(String userSkills, String jobSkills) {
        if (userSkills == null || jobSkills == null || userSkills.isEmpty() || jobSkills.isEmpty()) {
            return 0.0;
        }
        
        String[] required = jobSkills.toLowerCase().split(",");
        String userSkillsLower = userSkills.toLowerCase();
        
        int matchCount = 0;
        for (String req : required) {
            if (userSkillsLower.contains(req.trim())) {
                matchCount++;
            }
        }
        
        return (double) matchCount / required.length * 100.0;
    }
}
