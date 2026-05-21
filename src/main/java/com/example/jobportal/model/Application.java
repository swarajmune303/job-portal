package com.example.jobportal.model;

import jakarta.persistence.*;

@Entity
@Table(name = "applications")
public class Application {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "job_id")
    private Job job;
    
    @ManyToOne
    @JoinColumn(name = "user_id")
    private User applicant;
    
    // Status in ATS pipeline (APPLIED, SCREENING, ASSESSMENT, INTERVIEW, OFFER, REJECTED)
    private String status; 
    
    // Score based on skill matching during screening
    private Double resumeMatchScore;

    public Application() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Job getJob() {
        return job;
    }

    public void setJob(Job job) {
        this.job = job;
    }

    public User getApplicant() {
        return applicant;
    }

    public void setApplicant(User applicant) {
        this.applicant = applicant;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Double getResumeMatchScore() {
        return resumeMatchScore;
    }

    public void setResumeMatchScore(Double resumeMatchScore) {
        this.resumeMatchScore = resumeMatchScore;
    }
}
